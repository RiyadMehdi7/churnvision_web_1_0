/**
 * EmailComposer
 *
 * Outlook/Gmail-style email composer for AI-generated drafts.
 * Opens user's default mail client with pre-filled content.
 */

import { memo, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail,
  Send,
  X,
  Edit3,
  User,
  Paperclip,
  Bold,
  Italic,
  Underline,
  List,
  Link2,
  Image,
  Sparkles,
  ExternalLink,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Minimize2,
  Maximize2,
  Info,
  Wand2,
  Loader2,
  CornerDownLeft,
} from 'lucide-react';
import api from '@/services/apiService';

interface EmailComposerProps {
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  employeeName?: string;
  onClose?: () => void;
  onSent?: () => void;
}

// Generate mailto: link
function generateMailtoLink(to: string[], cc: string[], subject: string, body: string): string {
  const toStr = to.join(',');
  const params = new URLSearchParams();

  if (cc.length > 0) {
    params.set('cc', cc.join(','));
  }
  params.set('subject', subject);
  params.set('body', body);

  return `mailto:${toStr}?${params.toString()}`;
}

// Generate Gmail compose link
function generateGmailLink(to: string[], cc: string[], subject: string, body: string): string {
  const params = new URLSearchParams();
  params.set('view', 'cm');
  params.set('fs', '1');
  params.set('to', to.join(','));
  if (cc.length > 0) {
    params.set('cc', cc.join(','));
  }
  params.set('su', subject);
  params.set('body', body);

  return `https://mail.google.com/mail/?${params.toString()}`;
}

// Generate Outlook Web compose link
function generateOutlookLink(to: string[], cc: string[], subject: string, body: string): string {
  const params = new URLSearchParams();
  params.set('path', '/mail/action/compose');
  params.set('to', to.join(','));
  if (cc.length > 0) {
    params.set('cc', cc.join(','));
  }
  params.set('subject', subject);
  params.set('body', body);

  return `https://outlook.office.com/mail/deeplink/compose?${params.toString()}`;
}

export const EmailComposer = memo<EmailComposerProps>(({
  to: initialTo,
  cc: initialCc = [],
  subject: initialSubject,
  body: initialBody,
  employeeName,
  onClose,
  onSent,
}) => {
  const [to, setTo] = useState(initialTo.join(', '));
  const [cc, setCc] = useState(initialCc.join(', '));
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [showCc, setShowCc] = useState(initialCc.length > 0);
  const [isMinimized, setIsMinimized] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showSendOptions, setShowSendOptions] = useState(false);
  const [showAttachmentInfo, setShowAttachmentInfo] = useState(false);

  // AI Refinement state
  const [aiInstruction, setAiInstruction] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [lastChange, setLastChange] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const aiInputRef = useRef<HTMLInputElement>(null);

  // Text formatting helper - wraps selected text or inserts at cursor
  const applyFormatting = useCallback((prefix: string, suffix: string = prefix) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = body.substring(start, end);

    let newText: string;
    let newCursorPos: number;

    if (selectedText) {
      // Wrap selected text
      newText = body.substring(0, start) + prefix + selectedText + suffix + body.substring(end);
      newCursorPos = end + prefix.length + suffix.length;
    } else {
      // Insert formatting markers at cursor
      newText = body.substring(0, start) + prefix + suffix + body.substring(end);
      newCursorPos = start + prefix.length;
    }

    setBody(newText);

    // Restore focus and cursor position
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  }, [body]);

  const handleBold = useCallback(() => applyFormatting('**'), [applyFormatting]);
  const handleItalic = useCallback(() => applyFormatting('*'), [applyFormatting]);
  const handleUnderline = useCallback(() => applyFormatting('_'), [applyFormatting]);

  const handleList = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const beforeCursor = body.substring(0, start);
    const afterCursor = body.substring(start);

    // Find the start of the current line
    const lastNewline = beforeCursor.lastIndexOf('\n');
    const lineStart = lastNewline === -1 ? 0 : lastNewline + 1;

    // Insert bullet point at start of line
    const newText = body.substring(0, lineStart) + '• ' + body.substring(lineStart);
    setBody(newText);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + 2, start + 2);
    }, 0);
  }, [body]);

  const handleLink = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = body.substring(start, end);

    const linkText = selectedText || 'link text';
    const newText = body.substring(0, start) + `[${linkText}](url)` + body.substring(end);

    setBody(newText);

    // Position cursor at 'url' for easy replacement
    const urlStart = start + linkText.length + 3;
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(urlStart, urlStart + 3);
    }, 0);
  }, [body]);

  const handleImage = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const newText = body.substring(0, start) + '![image description](image-url)' + body.substring(start);

    setBody(newText);

    // Position cursor at 'image-url' for easy replacement
    const urlStart = start + 21;
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(urlStart, urlStart + 9);
    }, 0);
  }, [body]);

  const toArray = to.split(',').map(e => e.trim()).filter(Boolean);
  const ccArray = cc.split(',').map(e => e.trim()).filter(Boolean);

  const handleSendDefault = useCallback(() => {
    const link = generateMailtoLink(toArray, ccArray, subject, body);
    window.location.href = link;
    onSent?.();
  }, [toArray, ccArray, subject, body, onSent]);

  const handleSendGmail = useCallback(() => {
    const link = generateGmailLink(toArray, ccArray, subject, body);
    window.open(link, '_blank');
    onSent?.();
  }, [toArray, ccArray, subject, body, onSent]);

  const handleSendOutlook = useCallback(() => {
    const link = generateOutlookLink(toArray, ccArray, subject, body);
    window.open(link, '_blank');
    onSent?.();
  }, [toArray, ccArray, subject, body, onSent]);

  const handleCopyToClipboard = useCallback(async () => {
    const text = `To: ${to}\n${cc ? `Cc: ${cc}\n` : ''}Subject: ${subject}\n\n${body}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [to, cc, subject, body]);

  // AI Refinement handler
  const handleAiRefine = useCallback(async () => {
    if (!aiInstruction.trim() || isRefining) return;

    setIsRefining(true);
    setLastChange(null);

    try {
      const response = await api.post('/intelligent-chat/refine-content', {
        content_type: 'email',
        subject,
        body,
        instruction: aiInstruction,
        recipient_context: to ? `Recipients: ${to}` : undefined,
      });

      if (response.data) {
        const refinedBody = response.data.refined_body;
        const refinedSubject = response.data.refined_subject;

        // Check if we actually got refined content
        if (!refinedBody || refinedBody.trim() === '') {
          setLastChange('Failed to refine content. The AI returned empty content.');
          return;
        }

        // Only update if content actually changed
        if (refinedSubject && refinedSubject !== subject) {
          setSubject(refinedSubject);
        }

        // Update body if it changed
        if (refinedBody !== body) {
          setBody(refinedBody);
          setLastChange(response.data.changes_made || 'Content refined');
        } else {
          setLastChange('No changes were made - content already matches the instruction.');
        }
        setAiInstruction('');
      }
    } catch (error) {
      console.error('AI refinement error:', error);
      setLastChange('Failed to refine content. Please try again.');
    } finally {
      setIsRefining(false);
    }
  }, [aiInstruction, isRefining, subject, body, to]);

  const handleAiKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAiRefine();
    }
  }, [handleAiRefine]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden max-w-2xl w-full"
    >
      {/* Header - Outlook style */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail size={16} className="text-white/90" />
          <span className="text-white font-medium text-sm">New Message</span>
          <span className="flex items-center gap-1 text-[10px] text-blue-200 bg-blue-500/30 px-1.5 py-0.5 rounded">
            <Sparkles size={10} />
            AI Draft
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1.5 rounded hover:bg-white/10 text-white/80 hover:text-white transition-colors"
          >
            {isMinimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-white/10 text-white/80 hover:text-white transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {!isMinimized && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* To field */}
            <div className="border-b border-gray-100 dark:border-gray-700 px-4 py-2 flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-12">To</span>
              <input
                type="text"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="flex-1 text-sm text-gray-800 dark:text-gray-200 bg-transparent focus:outline-none"
                placeholder="Recipients"
              />
              <button
                onClick={() => setShowCc(!showCc)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                {showCc ? 'Hide Cc' : 'Cc'}
              </button>
            </div>

            {/* Cc field */}
            <AnimatePresence>
              {showCc && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-b border-gray-100 dark:border-gray-700 px-4 py-2 flex items-center gap-2"
                >
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-12">Cc</span>
                  <input
                    type="text"
                    value={cc}
                    onChange={(e) => setCc(e.target.value)}
                    className="flex-1 text-sm text-gray-800 dark:text-gray-200 bg-transparent focus:outline-none"
                    placeholder="Carbon copy recipients"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Subject field */}
            <div className="border-b border-gray-100 dark:border-gray-700 px-4 py-2 flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-12">Subject</span>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="flex-1 text-sm text-gray-800 dark:text-gray-200 bg-transparent focus:outline-none font-medium"
                placeholder="Subject"
              />
            </div>

            {/* Toolbar - Outlook style */}
            <div className="border-b border-gray-100 dark:border-gray-700 px-4 py-1.5 flex items-center gap-1">
              <button
                onClick={handleBold}
                title="Bold (**text**)"
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              >
                <Bold size={14} />
              </button>
              <button
                onClick={handleItalic}
                title="Italic (*text*)"
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              >
                <Italic size={14} />
              </button>
              <button
                onClick={handleUnderline}
                title="Underline (_text_)"
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              >
                <Underline size={14} />
              </button>
              <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
              <button
                onClick={handleList}
                title="Insert bullet point"
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              >
                <List size={14} />
              </button>
              <button
                onClick={handleLink}
                title="Insert link"
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              >
                <Link2 size={14} />
              </button>
              <button
                onClick={handleImage}
                title="Insert image reference"
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              >
                <Image size={14} />
              </button>
              <div className="relative">
                <button
                  onClick={() => setShowAttachmentInfo(!showAttachmentInfo)}
                  title="Attachments"
                  className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                >
                  <Paperclip size={14} />
                </button>
                <AnimatePresence>
                  {showAttachmentInfo && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-700 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 p-3 min-w-[220px] z-10"
                    >
                      <div className="flex items-start gap-2">
                        <Info size={14} className="text-blue-500 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-gray-600 dark:text-gray-300">
                          Attachments can be added after opening the email in your mail client (Gmail, Outlook, etc.)
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* AI Refinement Bar */}
            <div className="border-b border-gray-100 dark:border-gray-700 px-4 py-2 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/10 dark:to-blue-900/10">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400">
                  <Wand2 size={14} />
                  <span className="text-xs font-medium">AI Edit</span>
                </div>
                <div className="flex-1 relative">
                  <input
                    ref={aiInputRef}
                    type="text"
                    value={aiInstruction}
                    onChange={(e) => setAiInstruction(e.target.value)}
                    onKeyDown={handleAiKeyDown}
                    disabled={isRefining}
                    className="w-full text-sm text-gray-800 dark:text-gray-200 bg-white dark:bg-slate-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 pr-20 focus:outline-none focus:ring-2 focus:ring-purple-500/50 disabled:opacity-50"
                    placeholder="e.g., make it more formal, shorten it, add greeting..."
                  />
                  <button
                    onClick={handleAiRefine}
                    disabled={!aiInstruction.trim() || isRefining}
                    className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-1 text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 rounded transition-colors"
                  >
                    {isRefining ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <>
                        <CornerDownLeft size={12} />
                        Apply
                      </>
                    )}
                  </button>
                </div>
              </div>
              <AnimatePresence>
                {lastChange && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className={`text-xs mt-1.5 ${lastChange.includes('Failed') ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}
                  >
                    {lastChange.includes('Failed') ? lastChange : `✓ ${lastChange}`}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* Body */}
            <div className="px-4 py-3">
              <textarea
                ref={textareaRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                className="w-full text-sm text-gray-800 dark:text-gray-200 bg-transparent focus:outline-none resize-none leading-relaxed"
                placeholder="Write your message..."
              />
            </div>

            {/* Footer - Actions */}
            <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2">
                {/* Send button with dropdown */}
                <div className="relative">
                  <div className="flex">
                    <button
                      onClick={handleSendDefault}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-l-lg transition-colors"
                    >
                      <Send size={14} />
                      Send
                    </button>
                    <button
                      onClick={() => setShowSendOptions(!showSendOptions)}
                      className="px-2 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-r-lg border-l border-blue-500 transition-colors"
                    >
                      <ChevronDown size={14} />
                    </button>
                  </div>

                  {/* Send options dropdown */}
                  <AnimatePresence>
                    {showSendOptions && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="absolute bottom-full left-0 mb-1 bg-white dark:bg-slate-700 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 overflow-hidden min-w-[180px] z-10"
                      >
                        <button
                          onClick={() => { handleSendDefault(); setShowSendOptions(false); }}
                          className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-600 flex items-center gap-2"
                        >
                          <Mail size={14} />
                          Default Mail App
                        </button>
                        <button
                          onClick={() => { handleSendGmail(); setShowSendOptions(false); }}
                          className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-600 flex items-center gap-2"
                        >
                          <ExternalLink size={14} />
                          Open in Gmail
                        </button>
                        <button
                          onClick={() => { handleSendOutlook(); setShowSendOptions(false); }}
                          className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-600 flex items-center gap-2"
                        >
                          <ExternalLink size={14} />
                          Open in Outlook
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <button
                  onClick={handleCopyToClipboard}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>

              {employeeName && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                  <User size={12} />
                  <span>For: {employeeName}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

EmailComposer.displayName = 'EmailComposer';

export default EmailComposer;
