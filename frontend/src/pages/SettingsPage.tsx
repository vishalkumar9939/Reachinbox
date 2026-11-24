import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { slackApi } from '../services/api';
import { SlackIntegrationStatus } from '../types';
import {
  User,
  Slack,
  CheckCircle2,
  AlertCircle,
  Cpu,
  Mail,
  Send,
  Save,
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();

  const [slackStatus, setSlackStatus] = useState<SlackIntegrationStatus | null>(null);
  const [loadingSlack, setLoadingSlack] = useState<boolean>(true);
  const [testingSlack, setTestingSlack] = useState<boolean>(false);
  const [slackNotice, setSlackNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  // Default dispatcher configurations
  const [defaultSender, setDefaultSender] = useState<string>(user?.email || 'outreach@reachinbox.ai');
  const [minDelay, setMinDelay] = useState<number>(2000);
  const [hourlyLimit, setHourlyLimit] = useState<number>(200);
  const [savedSettings, setSavedSettings] = useState<boolean>(false);

  const fetchSlackStatus = async () => {
    try {
      const res = await slackApi.getStatus();
      if (res.success) {
        setSlackStatus(res);
      }
    } catch (err) {
      console.error('Failed to load Slack status:', err);
    } finally {
      setLoadingSlack(false);
    }
  };

  useEffect(() => {
    fetchSlackStatus();

    // Check query params from Slack OAuth callback
    const slackParam = searchParams.get('slack');
    if (slackParam === 'connected') {
      setSlackNotice({
        type: 'success',
        message: 'Slack has been successfully connected to your ReachInbox account!',
      });
    } else if (slackParam === 'error') {
      const reason = searchParams.get('reason') || 'Authorization was cancelled or failed';
      setSlackNotice({
        type: 'error',
        message: `Slack connection error: ${reason}`,
      });
    }
  }, [searchParams]);

  const handleConnectSlack = async () => {
    try {
      const res = await slackApi.getAuthUrl();
      if (res.success && res.url) {
        window.location.href = res.url;
      }
    } catch (err: any) {
      alert(
        err.response?.data?.message ||
          'Failed to retrieve Slack OAuth URL. Ensure SLACK_CLIENT_ID is set in .env'
      );
    }
  };

  const handleDisconnectSlack = async () => {
    if (!confirm('Are you sure you want to disconnect Slack rate-limit notifications?')) return;
    try {
      const res = await slackApi.disconnect();
      if (res.success) {
        setSlackNotice({
          type: 'success',
          message: 'Slack has been disconnected.',
        });
        fetchSlackStatus();
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to disconnect Slack');
    }
  };

  const handleTestSlack = async () => {
    setTestingSlack(true);
    setSlackNotice(null);
    try {
      const res = await slackApi.sendTestNotification();
      if (res.success) {
        setSlackNotice({
          type: 'success',
          message: 'Test notification delivered to your Slack channel!',
        });
      }
    } catch (err: any) {
      setSlackNotice({
        type: 'error',
        message: err.response?.data?.message || 'Failed to deliver test Slack message',
      });
    } finally {
      setTestingSlack(false);
    }
  };

  const handleSaveDefaults = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSettings(true);
    setTimeout(() => setSavedSettings(false), 2500);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">System Settings &amp; Integrations</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Manage your account profile, sending limits, Ethereal SMTP test credentials, and Slack notifications.
        </p>
      </div>

      {slackNotice && (
        <div
          className={`p-4 rounded-xl flex items-center gap-3 text-xs border ${
            slackNotice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {slackNotice.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{slackNotice.message}</span>
        </div>
      )}

      {/* User Profile Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-2">
          <User className="w-3.5 h-3.5 text-indigo-600" />
          <span>User Profile</span>
        </h3>

        <div className="flex items-center gap-4">
          {user?.avatar ? (
            <img
              src={user.avatar}
              alt={user.name}
              className="w-14 h-14 rounded-full border border-slate-200 object-cover shadow-xs"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-lg shadow-xs">
              {user?.name?.[0]?.toUpperCase() || 'U'}
            </div>
          )}
          <div>
            <h4 className="text-sm font-bold text-slate-900">{user?.name}</h4>
            <p className="text-xs text-slate-500">{user?.email}</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                Authenticated
              </span>
              <span className="text-[10px] text-slate-400">
                User ID: <code className="font-mono">{user?.id?.slice(0, 12)}...</code>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Slack Integration Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-2">
            <Slack className="w-4 h-4 text-[#4A154B]" />
            <span>Slack Rate-Limit Notifications</span>
          </h3>
          {slackStatus?.connected && (
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              Connected
            </span>
          )}
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          When your outreach reaches the hourly email threshold, ReachInbox automatically dispatches an alert
          to your Slack team containing sender identity, hourly limit, current usage, and next available resume
          window.
        </p>

        {loadingSlack ? (
          <div className="h-10 bg-slate-100 rounded-xl animate-pulse" />
        ) : slackStatus?.connected ? (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Workspace / Team</span>
                <span className="font-semibold text-slate-800">
                  {slackStatus.integration?.teamName || 'Active Workspace'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Notification Channel</span>
                <span className="font-semibold text-slate-800">
                  #{slackStatus.integration?.channelName || 'general'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleTestSlack}
                disabled={testingSlack}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-all"
              >
                <Send className="w-3 h-3" />
                <span>{testingSlack ? 'Sending Test...' : 'Send Test Alert'}</span>
              </button>
              <button
                onClick={handleDisconnectSlack}
                className="px-3 py-1.5 border border-slate-300 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 text-slate-600 rounded-lg text-xs font-medium transition-all"
              >
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-slate-800">Slack is not connected</p>
              <p className="text-[11px] text-slate-500">
                Hourly limits will still be enforced safely without crashing or failing emails.
              </p>
            </div>
            <button
              onClick={handleConnectSlack}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#4A154B] hover:bg-[#3F1140] text-white rounded-xl text-xs font-semibold shadow-xs transition-all shrink-0"
            >
              <Slack className="w-4 h-4" />
              <span>Connect Slack</span>
            </button>
          </div>
        )}
      </div>

      {/* Default Dispatcher Preferences Form */}
      <form onSubmit={handleSaveDefaults} className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5 text-indigo-600" />
            <span>Default Dispatcher Thresholds</span>
          </h3>
          {savedSettings && (
            <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Preferences saved</span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Default Sender Email</label>
            <input
              type="email"
              value={defaultSender}
              onChange={(e) => setDefaultSender(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Sending Delay (ms)</label>
            <input
              type="number"
              min="0"
              step="500"
              value={minDelay}
              onChange={(e) => setMinDelay(parseInt(e.target.value, 10) || 0)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Hourly Sending Limit</label>
            <input
              type="number"
              min="1"
              value={hourlyLimit}
              onChange={(e) => setHourlyLimit(parseInt(e.target.value, 10) || 200)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              required
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Preferences</span>
          </button>
        </div>
      </form>

      {/* SMTP Ethereal Environment Info */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-2">
          <Mail className="w-3.5 h-3.5 text-indigo-600" />
          <span>Ethereal SMTP Integration</span>
        </h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          Nodemailer is configured to dispatch through Ethereal Email fake SMTP. Test accounts are dynamically
          created or mapped to your <code className="font-mono">.env</code> SMTP configuration. All dispatched
          emails generate authentic preview URLs visible on the Sent tab.
        </p>
      </div>
    </div>
  );
};
