import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { emailApi } from '../services/api';
import {
  ArrowLeft,
  Paperclip,
  Clock,
  X,
  Upload,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  List,
  ListOrdered,
  Undo2,
  Redo2,
  Type,
  Strikethrough,
  Quote,
  Code2,
  ChevronUp,
  ChevronDown,
  Image as ImageIcon,
  FileText,
  Trash2,
  Check,
} from 'lucide-react';

interface AttachedFile {
  id: string;
  name: string;
  size: string;
  type: string;
  dataUrl: string;
  isImage: boolean;
}

export const ComposePage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [senderEmail] = useState(user?.email || 'outreach@reachinbox.ai');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientInput, setRecipientInput] = useState('');
  const [delayBetween, setDelayBetween] = useState(0);
  const [hourlyLimit, setHourlyLimit] = useState(0);

  // Send Later modal & scheduling
  const [showSendLater, setShowSendLater] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(''); // Local format: YYYY-MM-DDTHH:mm

  // Media / File Attachments
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null); // For CSV/TXT recipient list
  const mediaInputRef = useRef<HTMLInputElement>(null); // For Images / Media / Attachments
  const bodyRef = useRef<HTMLDivElement>(null);

  const MAX_VISIBLE_CHIPS = 3;

  // Format Date to local HTML datetime-local format: YYYY-MM-DDTHH:mm
  const formatToLocalDatetime = (d: Date) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const YYYY = d.getFullYear();
    const MM = pad(d.getMonth() + 1);
    const DD = pad(d.getDate());
    const HH = pad(d.getHours());
    const mm = pad(d.getMinutes());
    return `${YYYY}-${MM}-${DD}T${HH}:${mm}`;
  };

  // Add recipient on Enter, comma, or Tab
  const handleRecipientKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      e.preventDefault();
      addRecipient(recipientInput);
    }
  };

  const addRecipient = (value: string) => {
    const trimmed = value.trim().replace(/,$/g, '');
    if (!trimmed) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(trimmed) && !recipients.includes(trimmed.toLowerCase())) {
      setRecipients((prev) => [...prev, trimmed.toLowerCase()]);
    }
    setRecipientInput('');
  };

  const removeRecipient = (index: number) => {
    setRecipients((prev) => prev.filter((_, i) => i !== index));
  };

  // CSV/TXT Upload for Recipients
  const handleRecipientListUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (!content) return;
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const tokens = content
        .split(/[\r\n,;\t]+/)
        .map((t) => t.trim().replace(/^["'<]+|["'>]+$/g, ''))
        .filter(Boolean);
      const seen = new Set(recipients.map((r) => r.toLowerCase()));
      const newRecipients: string[] = [];
      for (const t of tokens) {
        if (emailRegex.test(t)) {
          const lower = t.toLowerCase();
          if (!seen.has(lower)) {
            seen.add(lower);
            newRecipients.push(lower);
          }
        }
      }
      setRecipients((prev) => [...prev, ...newRecipients]);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Media & File Attachments Upload
  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      const isImg = file.type.startsWith('image/');
      const formattedSize =
        file.size > 1024 * 1024
          ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
          : `${Math.round(file.size / 1024)} KB`;

      reader.onload = (evt) => {
        const dataUrl = evt.target?.result as string;
        const newAttachment: AttachedFile = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: file.name,
          size: formattedSize,
          type: file.type,
          dataUrl,
          isImage: isImg,
        };
        setAttachments((prev) => [...prev, newAttachment]);
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  // Rich-text editor commands
  const execCmd = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
    bodyRef.current?.focus();
  };

  // Quick picks for Send Later (computed in user's local timezone)
  const getQuickDates = () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const t10 = new Date(tomorrow);
    t10.setHours(10, 0, 0, 0);

    const t11 = new Date(tomorrow);
    t11.setHours(11, 0, 0, 0);

    const t15 = new Date(tomorrow);
    t15.setHours(15, 0, 0, 0);

    return [
      {
        label: 'Tomorrow',
        value: formatToLocalDatetime(tomorrow),
        display: 'Tomorrow (same time)',
      },
      {
        label: 'Tomorrow, 10:00 AM',
        value: formatToLocalDatetime(t10),
        display: 'Tomorrow at 10:00 AM',
      },
      {
        label: 'Tomorrow, 11:00 AM',
        value: formatToLocalDatetime(t11),
        display: 'Tomorrow at 11:00 AM',
      },
      {
        label: 'Tomorrow, 3:00 PM',
        value: formatToLocalDatetime(t15),
        display: 'Tomorrow at 3:00 PM',
      },
    ];
  };

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);

    if (recipients.length === 0) {
      setError('Please add at least one recipient.');
      return;
    }
    if (!subject.trim()) {
      setError('Subject is required.');
      return;
    }

    let htmlContent = bodyRef.current?.innerHTML || body || '<p>No content</p>';

    // If attachments exist, append them cleanly to the HTML content
    if (attachments.length > 0) {
      const attachmentsHtml = `
        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 12px; font-weight: 600; color: #4b5563; margin-bottom: 8px;">Attachments (${attachments.length}):</p>
          <div style="display: flex; flex-wrap: wrap; gap: 12px;">
            ${attachments
              .map((att) =>
                att.isImage
                  ? `<div style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; width: 140px; background: #fff;">
                      <img src="${att.dataUrl}" alt="${att.name}" style="width: 100%; height: 80px; object-fit: cover;" />
                      <div style="padding: 6px 8px;">
                        <p style="font-size: 11px; font-weight: 500; color: #1f2937; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${att.name}</p>
                        <p style="font-size: 10px; color: #6b7280; margin: 2px 0 0 0;">${att.size}</p>
                      </div>
                    </div>`
                  : `<div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; background: #f9fafb; font-size: 12px;">
                      📎 <strong>${att.name}</strong> (${att.size})
                    </div>`
              )
              .join('')}
          </div>
        </div>
      `;
      htmlContent += attachmentsHtml;
    }

    // Convert local datetime to UTC ISO string
    let startTimeIso: string;
    if (scheduledDate) {
      const parsed = new Date(scheduledDate);
      startTimeIso = isNaN(parsed.getTime())
        ? new Date(Date.now() + 60000).toISOString()
        : parsed.toISOString();
    } else {
      startTimeIso = new Date(Date.now() + 60000).toISOString();
    }

    setSubmitting(true);
    try {
      const res = await emailApi.scheduleBatch({
        recipients,
        senderEmail,
        subject,
        body: htmlContent,
        startTime: startTimeIso,
        delayBetweenEmails: delayBetween * 1000,
        hourlyLimit: hourlyLimit || 200,
        campaignName: subject,
      });
      if (res.success) {
        setSuccess(`Successfully queued ${res.scheduledCount} email(s)!`);
        setTimeout(() => navigate('/'), 1000);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to schedule emails.');
    } finally {
      setSubmitting(false);
    }
  };

  const visibleChips = recipients.slice(0, MAX_VISIBLE_CHIPS);
  const hiddenCount = recipients.length - MAX_VISIBLE_CHIPS;

  return (
    <div className="flex flex-col h-full relative">
      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.txt"
        onChange={handleRecipientListUpload}
        className="hidden"
      />
      <input
        ref={mediaInputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.doc,.docx,.txt"
        onChange={handleMediaUpload}
        className="hidden"
      />

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1 text-gray-500 hover:text-gray-800 transition-colors"
            title="Go Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900">Compose New Email</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Paperclip / File & Media Attachment Button */}
          <button
            type="button"
            onClick={() => mediaInputRef.current?.click()}
            className="relative p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
            title="Attach Media or Files"
          >
            <Paperclip className="w-4 h-4" />
            {attachments.length > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
                {attachments.length}
              </span>
            )}
          </button>

          {/* Clock / Send Later Button */}
          <button
            type="button"
            onClick={() => setShowSendLater(!showSendLater)}
            className={`p-2 rounded-lg transition-colors ${
              scheduledDate
                ? 'text-emerald-600 bg-emerald-50'
                : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'
            }`}
            title="Schedule / Send Later"
          >
            <Clock className="w-4 h-4" />
          </button>

          {/* Send / Send Later Action Button */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className={`px-4 py-1.5 border-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-50 ${
              scheduledDate
                ? 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700'
                : 'border-emerald-500 text-emerald-600 hover:bg-emerald-50'
            }`}
          >
            {submitting ? 'Sending...' : scheduledDate ? 'Send Later' : 'Send'}
          </button>
        </div>
      </div>

      {/* Error & Success Toasts */}
      {error && (
        <div className="mx-6 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {success && (
        <div className="mx-6 mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700 flex items-center justify-between">
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Form Fields */}
      <div className="px-6 py-2 space-y-0">
        {/* From Field */}
        <div className="flex items-center py-2.5 border-b border-gray-100">
          <label className="w-16 text-sm text-gray-500 shrink-0">From</label>
          <div className="flex items-center gap-1.5">
            <span className="px-3 py-1 bg-gray-100 rounded text-sm text-gray-700 font-medium">
              {senderEmail}
            </span>
            <ChevronDown className="w-3 h-3 text-gray-400" />
          </div>
        </div>

        {/* To Field */}
        <div className="flex items-center py-2.5 border-b border-gray-100">
          <label className="w-16 text-sm text-gray-500 shrink-0">To</label>
          <div className="flex-1 flex items-center flex-wrap gap-1.5">
            {visibleChips.map((r, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-medium"
              >
                {r}
                <button
                  type="button"
                  onClick={() => removeRecipient(i)}
                  className="hover:text-red-600"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {hiddenCount > 0 && (
              <span className="inline-flex items-center px-2 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-medium">
                +{hiddenCount}
              </span>
            )}
            <input
              type="text"
              value={recipientInput}
              onChange={(e) => setRecipientInput(e.target.value)}
              onKeyDown={handleRecipientKeyDown}
              onBlur={() => addRecipient(recipientInput)}
              placeholder={recipients.length === 0 ? 'recipient@example.com' : ''}
              className="flex-1 min-w-[150px] text-sm text-gray-700 placeholder-gray-400 outline-none bg-transparent"
            />
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 flex items-center gap-1.5 text-sm text-emerald-600 hover:text-emerald-700 font-medium ml-3"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload List
          </button>
        </div>

        {/* Subject Field */}
        <div className="flex items-center py-2.5 border-b border-gray-100">
          <label className="w-16 text-sm text-gray-500 shrink-0">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="flex-1 text-sm text-gray-700 placeholder-gray-400 outline-none"
          />
        </div>

        {/* Delay & Hourly Limit Fields */}
        <div className="flex items-center py-2.5 border-b border-gray-100 gap-6">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500">Delay between 2 emails</label>
            <input
              type="number"
              min={0}
              value={delayBetween}
              onChange={(e) => setDelayBetween(parseInt(e.target.value, 10) || 0)}
              className="w-16 px-2 py-1 border border-gray-200 rounded text-sm text-gray-700 text-center outline-none focus:ring-1 focus:ring-gray-300"
              placeholder="00"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500">Hourly Limit</label>
            <input
              type="number"
              min={0}
              value={hourlyLimit}
              onChange={(e) => setHourlyLimit(parseInt(e.target.value, 10) || 0)}
              className="w-16 px-2 py-1 border border-gray-200 rounded text-sm text-gray-700 text-center outline-none focus:ring-1 focus:ring-gray-300"
              placeholder="00"
            />
          </div>
          {scheduledDate && (
            <div className="ml-auto text-xs font-medium text-emerald-600 flex items-center gap-1 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              <Clock className="w-3.5 h-3.5" />
              <span>Scheduled: {new Date(scheduledDate).toLocaleString()}</span>
              <button
                type="button"
                onClick={() => setScheduledDate('')}
                className="ml-1 text-emerald-700 hover:text-red-600"
                title="Remove schedule"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Editor & Content Area */}
      <div className="flex-1 flex flex-col px-6 pb-6 overflow-y-auto">
        {/* Toolbar */}
        <div className="flex items-center gap-0.5 py-2 border-b border-gray-100 flex-wrap shrink-0">
          <button
            type="button"
            onClick={() => execCmd('undo')}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
            title="Undo"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => execCmd('redo')}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
            title="Redo"
          >
            <Redo2 className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-gray-200 mx-1" />
          <button
            type="button"
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
          >
            <Type className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-gray-200 mx-1" />
          <button
            type="button"
            onClick={() => execCmd('bold')}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
            title="Bold"
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => execCmd('italic')}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
            title="Italic"
          >
            <Italic className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => execCmd('underline')}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
            title="Underline"
          >
            <Underline className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-gray-200 mx-1" />
          <button
            type="button"
            onClick={() => execCmd('justifyLeft')}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
            title="Align Left"
          >
            <AlignLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-gray-200 mx-1" />
          <button
            type="button"
            onClick={() => execCmd('insertOrderedList')}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
            title="Numbered List"
          >
            <ListOrdered className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => execCmd('insertUnorderedList')}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
            title="Bullet List"
          >
            <List className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-gray-200 mx-1" />
          <button
            type="button"
            onClick={() => execCmd('formatBlock', 'blockquote')}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
            title="Quote"
          >
            <Quote className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => execCmd('formatBlock', 'pre')}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
            title="Code Block"
          >
            <Code2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => execCmd('strikethrough')}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
            title="Strikethrough"
          >
            <Strikethrough className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-gray-200 mx-1" />
          {/* Media / Photo Upload Button in Toolbar */}
          <button
            type="button"
            onClick={() => mediaInputRef.current?.click()}
            className="p-1.5 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors flex items-center gap-1 text-xs"
            title="Add Image or File"
          >
            <ImageIcon className="w-4 h-4" />
            <span className="hidden sm:inline text-[11px] font-medium">Add Media</span>
          </button>
        </div>

        {/* Content Editable Area */}
        <div
          ref={bodyRef}
          contentEditable
          suppressContentEditableWarning
          onInput={() => setBody(bodyRef.current?.innerHTML || '')}
          className="flex-1 outline-none text-sm text-gray-700 leading-relaxed py-4 min-h-[160px]"
          data-placeholder="Type Your Reply..."
        />

        {/* Attached Files & Media Preview Cards (Matching Figma Screens 4, 6 & 7) */}
        {attachments.length > 0 && (
          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Attached Files &amp; Media ({attachments.length})
              </span>
              <button
                type="button"
                onClick={() => setAttachments([])}
                className="text-xs text-red-500 hover:text-red-700 font-medium"
              >
                Remove all
              </button>
            </div>
            <div className="flex flex-wrap gap-3">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="relative group rounded-xl border border-gray-200 bg-white overflow-hidden shadow-xs hover:shadow-md transition-all w-36 shrink-0"
                >
                  {/* Thumbnail */}
                  {att.isImage ? (
                    <div className="w-full h-24 bg-gray-100 overflow-hidden flex items-center justify-center">
                      <img
                        src={att.dataUrl}
                        alt={att.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                    </div>
                  ) : (
                    <div className="w-full h-24 bg-emerald-50 flex flex-col items-center justify-center text-emerald-600">
                      <FileText className="w-8 h-8" />
                    </div>
                  )}

                  {/* Info */}
                  <div className="p-2">
                    <p
                      className="text-xs font-medium text-gray-800 truncate"
                      title={att.name}
                    >
                      {att.name}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{att.size}</p>
                  </div>

                  {/* Delete button */}
                  <button
                    type="button"
                    onClick={() => removeAttachment(att.id)}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 hover:bg-red-600 text-white flex items-center justify-center transition-colors shadow-sm"
                    title="Remove file"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Send Later Popup (Fixed positioning & timezone handling) */}
      {showSendLater && (
        <div className="fixed inset-0 z-50 flex items-center justify-center sm:justify-end sm:items-start p-4 sm:p-6 bg-black/20 backdrop-blur-2xs">
          {/* Backdrop click to dismiss */}
          <div
            className="absolute inset-0"
            onClick={() => setShowSendLater(false)}
          />

          <div
            className="relative w-full max-w-[340px] sm:mt-12 bg-white rounded-xl shadow-2xl border border-gray-200 z-10 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-600" />
                  <span>Send Later</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowSendLater(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Exact Datetime Input */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Pick Custom Date &amp; Time:
                </label>
                <input
                  type="datetime-local"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent font-sans"
                />
              </div>

              {/* Quick Picks */}
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Suggested Times
                </p>
                <div className="space-y-1">
                  {getQuickDates().map((item) => {
                    const isSelected = scheduledDate === item.value;
                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => setScheduledDate(item.value)}
                        className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors flex items-center justify-between ${
                          isSelected
                            ? 'bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <span>{item.label}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Selected date preview */}
              {scheduledDate && (
                <div className="mt-4 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
                  <span className="font-semibold block">Scheduled for:</span>
                  <span>{new Date(scheduledDate).toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 px-5 py-3 bg-gray-50 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setScheduledDate('');
                  setShowSendLater(false);
                }}
                className="px-3.5 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 rounded-lg transition-colors"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setShowSendLater(false)}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
