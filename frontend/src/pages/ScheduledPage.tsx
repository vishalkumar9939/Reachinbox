import React, { useEffect, useState } from 'react';
import { emailApi } from '../services/api';
import { Email } from '../types';
import { TableSkeleton } from '../components/LoadingSkeleton';
import { EmptyState } from '../components/EmptyState';
import {
  CalendarClock,
  Search,
  XCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Database,
  Layers,
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';

export const ScheduledPage: React.FC = () => {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [searchSource, setSearchSource] = useState<string>('');
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const fetchEmails = async () => {
    setLoading(true);
    try {
      const res = await emailApi.getEmails({
        status: 'SCHEDULED',
        q: searchQuery,
        page,
        limit: 10,
      });

      if (res.success) {
        setEmails(res.emails);
        setTotalPages(res.totalPages || 1);
        setTotalCount(res.total || 0);
        setSearchSource(res.source);
      }
    } catch (err) {
      console.error('Failed to fetch scheduled emails:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmails();
  }, [page]);

  // Real-time listener for newly scheduled or cancelled emails
  const { socket } = useSocket();
  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => {
      fetchEmails();
    };

    socket.on('email:scheduled', handleUpdate);
    socket.on('email:cancelled', handleUpdate);
    socket.on('email:processing', handleUpdate);

    return () => {
      socket.off('email:scheduled', handleUpdate);
      socket.off('email:cancelled', handleUpdate);
      socket.off('email:processing', handleUpdate);
    };
  }, [socket, page, searchQuery]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchEmails();
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this scheduled email?')) return;
    setCancellingId(id);
    try {
      const res = await emailApi.cancelEmail(id);
      if (res.success) {
        setEmails((prev) => prev.filter((item) => item.id !== id));
        setTotalCount((prev) => Math.max(0, prev - 1));
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to cancel email');
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Title & Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Scheduled Emails</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Emails queued in BullMQ awaiting their scheduled start time and dispatch offset.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {searchSource && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
              {searchSource === 'elasticsearch' ? (
                <>
                  <Layers className="w-3 h-3 text-emerald-600" />
                  <span>Elasticsearch Index</span>
                </>
              ) : (
                <>
                  <Database className="w-3 h-3 text-indigo-600" />
                  <span>DB Fallback Search</span>
                </>
              )}
            </span>
          )}
          <button
            onClick={fetchEmails}
            className="p-2 border border-slate-200 rounded-lg bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            title="Refresh list"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Search Input Bar */}
      <form onSubmit={handleSearchSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search scheduled emails by recipient, subject, sender, or content..."
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white transition-all"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-slate-900 hover:bg-black text-white text-xs font-semibold rounded-xl transition-all"
        >
          Search
        </button>
      </form>

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} />
        ) : emails.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No scheduled emails found"
            description={
              searchQuery
                ? 'No scheduled dispatches match your query terms.'
                : 'You have no emails currently scheduled in the queue.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-100 text-slate-400 uppercase text-[10px] font-semibold tracking-wider">
                  <th className="py-3 px-6">Recipient</th>
                  <th className="py-3 px-6">Subject</th>
                  <th className="py-3 px-6">Sender</th>
                  <th className="py-3 px-6">Scheduled Dispatch</th>
                  <th className="py-3 px-6">Campaign</th>
                  <th className="py-3 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {emails.map((email) => (
                  <tr key={email.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3.5 px-6 font-semibold text-slate-800">
                      {email.recipientEmail}
                    </td>
                    <td className="py-3.5 px-6 text-slate-600 max-w-xs truncate">
                      {email.subject}
                    </td>
                    <td className="py-3.5 px-6 text-slate-500 text-[11px]">
                      {email.senderEmail}
                    </td>
                    <td className="py-3.5 px-6 text-slate-700">
                      <span className="font-medium">
                        {new Date(email.scheduledAt).toLocaleDateString()}
                      </span>{' '}
                      <span className="text-slate-400">
                        {new Date(email.scheduledAt).toLocaleTimeString()}
                      </span>
                    </td>
                    <td className="py-3.5 px-6">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                        {email.campaign?.name || 'Direct'}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      <button
                        onClick={() => handleCancel(email.id)}
                        disabled={cancellingId === email.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors"
                      >
                        <XCircle className="w-3 h-3" />
                        <span>{cancellingId === email.id ? 'Cancelling...' : 'Cancel'}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalCount > 10 && (
          <div className="py-3 px-6 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 bg-slate-50/50">
            <span>
              Showing {emails.length} of {totalCount} scheduled
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1 rounded border border-slate-200 hover:bg-white disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-semibold text-slate-700">
                {page} / {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="p-1 rounded border border-slate-200 hover:bg-white disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
