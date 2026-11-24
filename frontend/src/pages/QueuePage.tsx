import React, { useEffect, useState } from 'react';
import { queueApi } from '../services/api';
import { QueueStatistics, RecentJob } from '../types';
import { CardSkeleton } from '../components/LoadingSkeleton';
import {
  Clock,
  Play,
  Pause,
  Trash2,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  Activity,
  Hourglass,
  CheckCircle2,
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';

export const QueuePage: React.FC = () => {
  const [stats, setStats] = useState<QueueStatistics | null>(null);
  const [recentJobs, setRecentJobs] = useState<{
    active: RecentJob[];
    delayed: RecentJob[];
    waiting: RecentJob[];
    failed: RecentJob[];
  }>({ active: [], delayed: [], waiting: [], failed: [] });

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'delayed' | 'waiting' | 'active' | 'failed'>('delayed');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      const res = await queueApi.getStatistics();
      if (res.success) {
        setStats(res.stats);
        setRecentJobs(res.recentJobs);
      }
    } catch (err) {
      console.error('Failed to load queue stats:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const { socket } = useSocket();
  useEffect(() => {
    if (!socket) return;
    const handleQueueUpdate = () => {
      fetchStats();
    };

    socket.on('queue:updated', handleQueueUpdate);
    socket.on('email:scheduled', handleQueueUpdate);
    socket.on('email:sent', handleQueueUpdate);
    socket.on('email:failed', handleQueueUpdate);
    socket.on('email:rate-limited', handleQueueUpdate);

    return () => {
      socket.off('queue:updated', handleQueueUpdate);
      socket.off('email:scheduled', handleQueueUpdate);
      socket.off('email:sent', handleQueueUpdate);
      socket.off('email:failed', handleQueueUpdate);
      socket.off('email:rate-limited', handleQueueUpdate);
    };
  }, [socket]);

  const handlePauseResume = async () => {
    if (!stats) return;
    setActionLoading('pause');
    try {
      if (stats.paused) {
        await queueApi.resumeQueue();
      } else {
        await queueApi.pauseQueue();
      }
      await fetchStats();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Queue action failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCleanFailed = async () => {
    if (!confirm('Are you sure you want to clear failed jobs from the BullMQ history?')) return;
    setActionLoading('clean');
    try {
      await queueApi.cleanFailed();
      await fetchStats();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Clean failed');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  const jobsList = recentJobs[activeTab] || [];

  return (
    <div className="space-y-8">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">BullMQ Queue Engine Monitor</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time introspection into the underlying Redis-backed BullMQ persistent dispatch pipeline.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setRefreshing(true);
              fetchStats();
            }}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handlePauseResume}
            disabled={actionLoading === 'pause'}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition-all ${
              stats?.paused
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-amber-600 hover:bg-amber-700 text-white'
            }`}
          >
            {stats?.paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            <span>{stats?.paused ? 'Resume Queue' : 'Pause Queue'}</span>
          </button>

          <button
            onClick={handleCleanFailed}
            disabled={actionLoading === 'clean'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold shadow-2xs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clean Failed</span>
          </button>

          <a
            href="/admin/queues"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 hover:bg-black text-white text-xs font-semibold rounded-lg shadow-sm"
          >
            <span>Open Bull Board</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Queue State Banner if paused */}
      {stats?.paused && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3 text-xs text-amber-800">
          <Pause className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="font-semibold">
            Queue is currently PAUSED. Active and delayed jobs will not dispatch until resumed.
          </span>
        </div>
      )}

      {/* 5 BullMQ Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* Delayed */}
        <div
          onClick={() => setActiveTab('delayed')}
          className={`cursor-pointer p-5 rounded-2xl bg-white border transition-all shadow-xs ${
            activeTab === 'delayed' ? 'border-indigo-600 ring-2 ring-indigo-100' : 'border-slate-200/80 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Delayed</span>
            <Hourglass className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2">{stats?.delayed ?? 0}</div>
          <span className="text-[10px] text-slate-400">Timer scheduled</span>
        </div>

        {/* Waiting */}
        <div
          onClick={() => setActiveTab('waiting')}
          className={`cursor-pointer p-5 rounded-2xl bg-white border transition-all shadow-xs ${
            activeTab === 'waiting' ? 'border-indigo-600 ring-2 ring-indigo-100' : 'border-slate-200/80 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Waiting</span>
            <Clock className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2">{stats?.waiting ?? 0}</div>
          <span className="text-[10px] text-slate-400">Ready for worker</span>
        </div>

        {/* Active */}
        <div
          onClick={() => setActiveTab('active')}
          className={`cursor-pointer p-5 rounded-2xl bg-white border transition-all shadow-xs ${
            activeTab === 'active' ? 'border-indigo-600 ring-2 ring-indigo-100' : 'border-slate-200/80 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Active</span>
            <Activity className="w-4 h-4 text-indigo-500 animate-pulse" />
          </div>
          <div className="text-2xl font-bold text-indigo-600 mt-2">{stats?.active ?? 0}</div>
          <span className="text-[10px] text-slate-400">In worker process</span>
        </div>

        {/* Completed */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Completed</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-emerald-600 mt-2">{stats?.completed ?? 0}</div>
          <span className="text-[10px] text-slate-400">Successfully handled</span>
        </div>

        {/* Failed */}
        <div
          onClick={() => setActiveTab('failed')}
          className={`cursor-pointer p-5 rounded-2xl bg-white border transition-all shadow-xs ${
            activeTab === 'failed' ? 'border-indigo-600 ring-2 ring-indigo-100' : 'border-slate-200/80 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Failed</span>
            <AlertCircle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-rose-600 mt-2">{stats?.failed ?? 0}</div>
          <span className="text-[10px] text-slate-400">Errored jobs</span>
        </div>
      </div>

      {/* Tab Navigation for Detailed Jobs View */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h3 className="text-sm font-semibold text-slate-900">
              Live Queue Inspector ({activeTab.toUpperCase()})
            </h3>
          </div>
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            {(['delayed', 'waiting', 'active', 'failed'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${
                  activeTab === tab
                    ? 'bg-white text-indigo-700 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab} ({recentJobs[tab]?.length || 0})
              </button>
            ))}
          </div>
        </div>

        {jobsList.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs">
            No jobs currently in the {activeTab} bucket.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-100 text-slate-400 uppercase text-[10px] font-semibold tracking-wider">
                  <th className="py-3 px-6">BullMQ Job ID</th>
                  <th className="py-3 px-6">Recipient</th>
                  <th className="py-3 px-6">Subject</th>
                  <th className="py-3 px-6">Delay Setting</th>
                  <th className="py-3 px-6">Attempts</th>
                  <th className="py-3 px-6 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobsList.map((job) => (
                  <tr key={job.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3.5 px-6 font-mono font-semibold text-indigo-600 text-[11px]">
                      {job.id}
                    </td>
                    <td className="py-3.5 px-6 font-medium text-slate-800">
                      {job.data?.recipientEmail || 'N/A'}
                    </td>
                    <td className="py-3.5 px-6 text-slate-600 max-w-xs truncate">
                      {job.data?.subject || 'N/A'}
                    </td>
                    <td className="py-3.5 px-6 text-slate-500 font-mono text-[11px]">
                      {job.delay ? `${Math.round(job.delay / 1000)}s` : 'None'}
                    </td>
                    <td className="py-3.5 px-6 text-slate-700 font-semibold">
                      {job.attemptsMade} / 3
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      {job.failedReason ? (
                        <span className="text-rose-600 text-[11px] font-mono truncate block max-w-xs ml-auto">
                          {job.failedReason}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">Enqueued</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
