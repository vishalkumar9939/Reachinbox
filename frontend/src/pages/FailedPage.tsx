import React, { useEffect, useState } from 'react';
import { emailApi } from '../services/api';
import { Email } from '../types';
import { TableSkeleton } from '../components/LoadingSkeleton';
import { EmptyState } from '../components/EmptyState';
import {
  AlertOctagon,
  Search,
  RotateCcw,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Database,
  Layers,
  AlertTriangle,
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';

export const FailedPage: React.FC = () => {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [searchSource, setSearchSource] = useState<string>('');
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const fetchEmails = async () => {
    setLoading(true);
    try {
      const res = await emailApi.getEmails({
        status: 'FAILED',
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
      console.error('Failed to fetch failed emails:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmails();
  }, [page]);

  const { socket } = useSocket();
  useEffect(() => {
    if (!socket) return;
    const handleFailed = () => {
      fetchEmails();
    };

    socket.on('email:failed', handleFailed);
    socket.on('email:retried', handleFailed);

    return () => {
      socket.off('email:failed', handleFailed);
      socket.off('email:retried', handleFailed);
    };
  }, [socket, page, searchQuery]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchEmails();
  };

  const handleRetry = async (id: string) => {
    setRetryingId(id);
    try {
      const res = await emailApi.retryEmail(id);
      if (res.success) {
        setEmails((prev) => prev.filter((item) => item.id !== id));
        setTotalCount((prev) => Math.max(0, prev - 1));
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to retry email');
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Failed Dispatches</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Emails that failed SMTP transmission. Review detailed error reasons and re-enqueue safely.
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
            placeholder="Search failed emails by recipient, subject, error reason, or content..."
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
            icon={AlertOctagon}
            title="No delivery failures"
            description={
              searchQuery
                ? 'No failed emails match your search query.'
                : 'Excellent! All queued emails have dispatched cleanly with zero delivery failures.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-100 text-slate-400 uppercase text-[10px] font-semibold tracking-wider">
                  <th className="py-3 px-6">Recipient</th>
                  <th className="py-3 px-6">Subject</th>
                  <th className="py-3 px-6">Failure Reason</th>
                  <th className="py-3 px-6">Failed At</th>
                  <th className="py-3 px-6">Retries</th>
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
                    <td className="py-3.5 px-6 max-w-xs">
                      <div className="flex items-start gap-1.5 text-rose-700 bg-rose-50 px-2 py-1 rounded-lg border border-rose-200/60 text-[11px] font-mono leading-tight">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-600" />
                        <span className="truncate" title={email.failureReason || 'Unknown error'}>
                          {email.failureReason || 'SMTP transmission failure'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-6 text-slate-500 text-[11px]">
                      {new Date(email.updatedAt).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-6 text-slate-600 font-semibold">
                      {email.retryCount}
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      <button
                        onClick={() => handleRetry(email.id)}
                        disabled={retryingId === email.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[11px] font-semibold border border-indigo-200 transition-colors shadow-2xs"
                      >
                        <RotateCcw
                          className={`w-3 h-3 ${retryingId === email.id ? 'animate-spin' : ''}`}
                        />
                        <span>{retryingId === email.id ? 'Requeuing...' : 'Retry'}</span>
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
              Showing {emails.length} of {totalCount} failed
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
