import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { emailApi } from '../services/api';
import { Email } from '../types';
import { useAuth } from '../context/AuthContext';
import { ArrowLeft, Star, Archive, Trash2, ExternalLink } from 'lucide-react';

export const EmailDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [email, setEmail] = useState<Email | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetchEmail = async () => {
      try {
        const res = await emailApi.getEmailById(id);
        if (res.success) {
          setEmail(res.email);
        }
      } catch (err) {
        console.error('Failed to fetch email:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchEmail();
  }, [id]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (!email) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full text-gray-400">
        <p className="text-sm">Email not found</p>
        <button onClick={() => navigate(-1)} className="mt-3 text-sm text-emerald-600 hover:text-emerald-700 font-medium">
          ← Go back
        </button>
      </div>
    );
  }

  const sentDate = email.sentAt
    ? new Date(email.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
    : new Date(email.scheduledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

  const senderInitial = email.senderEmail[0]?.toUpperCase() || 'S';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1 text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900 truncate">{email.subject}</h1>
        </div>

        <div className="flex items-center gap-2">
          <button className="p-2 text-gray-400 hover:text-amber-400 transition-colors">
            <Star className="w-4 h-4" />
          </button>
          <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
            <Archive className="w-4 h-4" />
          </button>
          <button className="p-2 text-gray-400 hover:text-red-500 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
          {user?.avatar ? (
            <img src={user.avatar} alt="" className="w-8 h-8 rounded-full ml-2" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-teal-500 text-white flex items-center justify-center text-xs font-bold ml-2">
              {user?.name?.[0]?.toUpperCase() || 'U'}
            </div>
          )}
        </div>
      </div>

      {/* Email Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {/* Sender Info */}
        <div className="flex items-start gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center text-sm font-bold shrink-0">
            {senderInitial}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-semibold text-gray-900">
                  {email.senderEmail.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </span>
                <span className="text-sm text-gray-400 ml-1.5">
                  &lt;{email.senderEmail}&gt;
                </span>
              </div>
              <span className="text-xs text-gray-400 shrink-0">{sentDate}</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">to {email.recipientEmail}</p>
          </div>
        </div>

        {/* Email Body */}
        <div className="pl-[52px]">
          <div
            className="text-sm text-gray-700 leading-relaxed prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: email.body || '<p>No content</p>' }}
          />

          {/* Status Badge */}
          <div className="mt-6 flex items-center gap-3">
            <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold ${
              email.status === 'SENT' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
              email.status === 'SCHEDULED' ? 'bg-orange-50 text-orange-700 border border-orange-200' :
              email.status === 'FAILED' ? 'bg-red-50 text-red-700 border border-red-200' :
              'bg-gray-100 text-gray-600'
            }`}>
              {email.status}
            </span>

            {email.previewUrl && (
              <a
                href={email.previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                View on Ethereal
              </a>
            )}
          </div>

          {/* Metadata */}
          <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-100 text-xs text-gray-500 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-600 w-24">Idempotency:</span>
              <code className="font-mono text-gray-400">{email.idempotencyKey}</code>
            </div>
            {email.messageId && (
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-600 w-24">Message ID:</span>
                <code className="font-mono text-gray-400">{email.messageId}</code>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-600 w-24">Scheduled:</span>
              <span>{new Date(email.scheduledAt).toLocaleString()}</span>
            </div>
            {email.sentAt && (
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-600 w-24">Sent:</span>
                <span>{new Date(email.sentAt).toLocaleString()}</span>
              </div>
            )}
            {email.failureReason && (
              <div className="flex items-center gap-2">
                <span className="font-medium text-red-600 w-24">Error:</span>
                <span className="text-red-500">{email.failureReason}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
