import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ToastContainer } from '../components/Toast';
import { emailApi } from '../services/api';
import { useSocket } from '../context/SocketContext';
import { Clock, Send, ChevronDown } from 'lucide-react';

export const DashboardLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { socket } = useSocket();
  const [scheduledCount, setScheduledCount] = useState(0);
  const [sentCount, setSentCount] = useState(0);

  const fetchCounts = async () => {
    try {
      const [sched, sent] = await Promise.allSettled([
        emailApi.getEmails({ status: 'SCHEDULED', page: 1, limit: 1 }),
        emailApi.getEmails({ status: 'SENT', page: 1, limit: 1 }),
      ]);
      if (sched.status === 'fulfilled') setScheduledCount(sched.value.total);
      if (sent.status === 'fulfilled') setSentCount(sent.value.total);
    } catch {}
  };

  useEffect(() => {
    fetchCounts();
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => fetchCounts();
    socket.on('email:scheduled', handleUpdate);
    socket.on('email:sent', handleUpdate);
    socket.on('email:failed', handleUpdate);
    return () => {
      socket.off('email:scheduled', handleUpdate);
      socket.off('email:sent', handleUpdate);
      socket.off('email:failed', handleUpdate);
    };
  }, [socket]);

  return (
    <div className="flex min-h-screen bg-[#1a1a2e] font-['Inter',sans-serif]">
      {/* Sidebar */}
      <aside className="w-[220px] bg-white border-r border-gray-100 flex flex-col shrink-0">
        {/* Logo */}
        <div className="px-5 pt-5 pb-3">
          <h1 className="text-2xl font-black tracking-tight text-gray-900" style={{ fontFamily: "'Inter', sans-serif" }}>
            ONB
          </h1>
        </div>

        {/* User Info */}
        <div className="px-5 py-3 flex items-center gap-2.5">
          {user?.avatar ? (
            <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-teal-500 text-white flex items-center justify-center text-xs font-bold">
              {user?.name?.[0]?.toUpperCase() || 'U'}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 truncate">{user?.name || 'User'}</p>
            <p className="text-[11px] text-gray-400 truncate">{user?.email}</p>
          </div>
          <button onClick={logout} className="text-gray-400 hover:text-gray-600">
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>

        {/* Compose Button */}
        <div className="px-5 py-3">
          <button
            onClick={() => navigate('/compose')}
            className="w-full py-2 border-2 border-emerald-500 text-emerald-600 rounded-lg text-sm font-semibold hover:bg-emerald-50 transition-colors"
          >
            Compose
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 pt-3">
          <div className="px-3 pb-2 text-[10px] font-semibold tracking-wider text-gray-400 uppercase">
            Core
          </div>

          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all ${
                isActive
                  ? 'bg-gray-50 text-gray-900 font-semibold'
                  : 'text-gray-600 hover:bg-gray-50'
              }`
            }
          >
            <div className="flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-gray-400" />
              <span>Scheduled</span>
            </div>
            {scheduledCount > 0 && (
              <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full font-medium">
                {scheduledCount}
              </span>
            )}
          </NavLink>

          <NavLink
            to="/sent"
            className={({ isActive }) =>
              `flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all ${
                isActive
                  ? 'bg-gray-50 text-gray-900 font-semibold'
                  : 'text-gray-600 hover:bg-gray-50'
              }`
            }
          >
            <div className="flex items-center gap-2.5">
              <Send className="w-4 h-4 text-gray-400" />
              <span>Sent</span>
            </div>
            {sentCount > 0 && (
              <span className="text-xs text-gray-500 font-medium">
                {sentCount}
              </span>
            )}
          </NavLink>
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-white m-2 ml-0 rounded-lg overflow-hidden">
        <Outlet />
      </div>

      <ToastContainer />
    </div>
  );
};
