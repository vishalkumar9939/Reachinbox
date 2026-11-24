import React from 'react';
import { useSocket } from '../context/SocketContext';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X, ExternalLink } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { notifications, clearNotification } = useSocket();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {notifications.slice(0, 5).map((n) => {
        const getIcon = () => {
          switch (n.type) {
            case 'success':
              return <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />;
            case 'error':
              return <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />;
            case 'warning':
              return <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />;
            default:
              return <Info className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />;
          }
        };

        const getBorder = () => {
          switch (n.type) {
            case 'success':
              return 'border-emerald-200 bg-white';
            case 'error':
              return 'border-rose-200 bg-white';
            case 'warning':
              return 'border-amber-200 bg-amber-50/50';
            default:
              return 'border-indigo-100 bg-white';
          }
        };

        return (
          <div
            key={n.id}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-lg transition-all animate-in slide-in-from-bottom-2 ${getBorder()}`}
          >
            {getIcon()}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <h4 className="text-xs font-semibold text-slate-800">{n.title}</h4>
                <span className="text-[10px] text-slate-400">{n.timestamp}</span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{n.message}</p>
              {n.previewUrl && (
                <a
                  href={n.previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                >
                  <span>View Ethereal Preview</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <button
              onClick={() => clearNotification(n.id)}
              className="text-slate-400 hover:text-slate-600 p-0.5 -mr-1 -mt-1 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
