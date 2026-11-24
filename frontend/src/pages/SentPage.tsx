import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { emailApi } from '../services/api';
import { Email } from '../types';
import { useSocket } from '../context/SocketContext';
import { Search, Filter, RefreshCw, Star } from 'lucide-react';

export const SentPage: React.FC = () => {
  const navigate = useNavigate();
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const fetchEmails = async (query?: string) => {
    try {
      const res = await emailApi.getEmails({
        status: 'SENT',
        q: query || undefined,
        page: 1,
        limit: 50,
      });
      if (res.success) {
        setEmails(res.emails);
      }
    } catch (err) {
      console.error('Failed to fetch sent emails:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchEmails();
  }, []);

  const { socket } = useSocket();
  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => fetchEmails(searchQuery);
    socket.on('email:sent', handleUpdate);
    return () => {
      socket.off('email:sent', handleUpdate);
    };
  }, [socket, searchQuery]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    fetchEmails(searchQuery);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchEmails(searchQuery);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search Bar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-100">
        <form onSubmit={handleSearch} className="flex-1 relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search"
            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
          />
        </form>
        <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
          <Filter className="w-4 h-4" />
        </button>
        <button
          onClick={handleRefresh}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Email List */}
      <div className="flex-1 overflow-y-auto">
        {emails.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <p className="text-sm">No sent emails yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {emails.map((email) => (
              <div
                key={email.id}
                onClick={() => navigate(`/email/${email.id}`)}
                className="flex items-center gap-4 px-6 py-3.5 hover:bg-gray-50/70 cursor-pointer transition-colors group"
              >
                {/* Recipient */}
                <div className="w-[180px] shrink-0">
                  <span className="text-sm text-gray-700">
                    To: <span className="font-medium text-gray-900">{email.recipientEmail.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
                  </span>
                </div>

                {/* Sent Badge */}
                <div className="shrink-0">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-gray-100 text-gray-600">
                    Sent
                  </span>
                </div>

                {/* Subject & Preview */}
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {email.subject}
                  </span>
                  <span className="text-sm text-gray-400 truncate">
                    - {email.body?.replace(/<[^>]*>/g, '').slice(0, 60)}...
                  </span>
                </div>

                {/* Star */}
                <button
                  onClick={(e) => e.stopPropagation()}
                  className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-amber-400 transition-all"
                >
                  <Star className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
