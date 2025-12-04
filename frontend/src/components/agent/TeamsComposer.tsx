/**
 * TeamsComposer
 *
 * Microsoft Teams-style composer for AI-generated meeting/chat requests.
 * Opens Teams with prefilled chat message or meeting form.
 */

import { memo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  Video,
  X,
  User,
  Users,
  Clock,
  Calendar,
  Sparkles,
  Copy,
  Check,
  ChevronDown,
  Minimize2,
  Maximize2,
  ExternalLink,
  Phone,
} from 'lucide-react';

interface TeamsComposerProps {
  attendees: string[];
  subject: string;
  message: string;
  duration?: number; // minutes
  proposedTime?: Date;
  employeeName?: string;
  mode?: 'chat' | 'meeting';
  onClose?: () => void;
  onSent?: () => void;
}

// Generate Teams chat link with prefilled message
function generateTeamsChatLink(attendees: string[], message: string): string {
  const users = attendees.join(',');
  const params = new URLSearchParams();
  params.set('users', users);
  if (message) {
    params.set('message', message);
  }
  return `https://teams.microsoft.com/l/chat/0/0?${params.toString()}`;
}

// Generate Teams meeting link with prefilled details
function generateTeamsMeetingLink(
  attendees: string[],
  subject: string,
  agenda: string
): string {
  const params = new URLSearchParams();
  params.set('subject', subject);
  params.set('attendees', attendees.join(','));
  if (agenda) {
    params.set('content', agenda);
  }
  return `https://teams.microsoft.com/l/meeting/new?${params.toString()}`;
}

// Generate Teams call link
function generateTeamsCallLink(attendee: string): string {
  return `https://teams.microsoft.com/l/call/0/0?users=${attendee}`;
}

export const TeamsComposer = memo<TeamsComposerProps>(({
  attendees: initialAttendees,
  subject: initialSubject,
  message: initialMessage,
  duration: initialDuration = 30,
  proposedTime,
  employeeName,
  mode: initialMode = 'meeting',
  onClose,
  onSent,
}) => {
  const [attendees, setAttendees] = useState(initialAttendees.join(', '));
  const [subject, setSubject] = useState(initialSubject);
  const [message, setMessage] = useState(initialMessage);
  const [duration, setDuration] = useState(initialDuration);
  const [activeMode, setActiveMode] = useState<'chat' | 'meeting' | 'call'>(initialMode);
  const [isMinimized, setIsMinimized] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  const attendeesArray = attendees.split(',').map(e => e.trim()).filter(Boolean);

  const handleOpenTeamsChat = useCallback(() => {
    const link = generateTeamsChatLink(attendeesArray, message);
    window.open(link, '_blank');
    onSent?.();
  }, [attendeesArray, message, onSent]);

  const handleOpenTeamsMeeting = useCallback(() => {
    const link = generateTeamsMeetingLink(attendeesArray, subject, message);
    window.open(link, '_blank');
    onSent?.();
  }, [attendeesArray, subject, message, onSent]);

  const handleOpenTeamsCall = useCallback(() => {
    if (attendeesArray.length > 0) {
      const link = generateTeamsCallLink(attendeesArray[0]);
      window.open(link, '_blank');
      onSent?.();
    }
  }, [attendeesArray, onSent]);

  const handleCopyToClipboard = useCallback(async () => {
    const text = activeMode === 'chat'
      ? `To: ${attendees}\n\nMessage:\n${message}`
      : `Meeting: ${subject}\nAttendees: ${attendees}\nDuration: ${duration} min\n${proposedTime ? `Proposed Time: ${proposedTime.toLocaleString()}\n` : ''}\nAgenda:\n${message}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [activeMode, attendees, subject, message, duration, proposedTime]);

  const handlePrimaryAction = useCallback(() => {
    if (activeMode === 'chat') {
      handleOpenTeamsChat();
    } else if (activeMode === 'call') {
      handleOpenTeamsCall();
    } else {
      handleOpenTeamsMeeting();
    }
  }, [activeMode, handleOpenTeamsChat, handleOpenTeamsMeeting, handleOpenTeamsCall]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden max-w-2xl w-full"
    >
      {/* Header - Teams purple style */}
      <div className="bg-gradient-to-r from-[#5b5fc7] to-[#7b83eb] px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {activeMode === 'chat' ? (
            <MessageSquare size={16} className="text-white/90" />
          ) : activeMode === 'call' ? (
            <Phone size={16} className="text-white/90" />
          ) : (
            <Video size={16} className="text-white/90" />
          )}
          <span className="text-white font-medium text-sm">
            {activeMode === 'chat' ? 'New Chat' : activeMode === 'call' ? 'Start Call' : 'New Meeting'}
          </span>
          <span className="flex items-center gap-1 text-[10px] text-purple-200 bg-purple-500/30 px-1.5 py-0.5 rounded">
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
            {/* Mode selector */}
            <div className="border-b border-gray-100 dark:border-gray-700 px-4 py-2 flex items-center gap-2">
              <button
                onClick={() => setActiveMode('chat')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  activeMode === 'chat'
                    ? 'bg-[#5b5fc7] text-white'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <MessageSquare size={12} />
                Chat
              </button>
              <button
                onClick={() => setActiveMode('meeting')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  activeMode === 'meeting'
                    ? 'bg-[#5b5fc7] text-white'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <Video size={12} />
                Meeting
              </button>
              <button
                onClick={() => setActiveMode('call')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  activeMode === 'call'
                    ? 'bg-[#5b5fc7] text-white'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <Phone size={12} />
                Call
              </button>
            </div>

            {/* Attendees field */}
            <div className="border-b border-gray-100 dark:border-gray-700 px-4 py-2 flex items-center gap-2">
              <Users size={14} className="text-gray-400" />
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-16">
                {activeMode === 'chat' ? 'To' : 'Invite'}
              </span>
              <input
                type="text"
                value={attendees}
                onChange={(e) => setAttendees(e.target.value)}
                className="flex-1 text-sm text-gray-800 dark:text-gray-200 bg-transparent focus:outline-none"
                placeholder="Enter email addresses"
              />
            </div>

            {/* Subject field - only for meetings */}
            {activeMode === 'meeting' && (
              <div className="border-b border-gray-100 dark:border-gray-700 px-4 py-2 flex items-center gap-2">
                <Calendar size={14} className="text-gray-400" />
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-16">Title</span>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="flex-1 text-sm text-gray-800 dark:text-gray-200 bg-transparent focus:outline-none font-medium"
                  placeholder="Meeting title"
                />
              </div>
            )}

            {/* Duration - only for meetings */}
            {activeMode === 'meeting' && (
              <div className="border-b border-gray-100 dark:border-gray-700 px-4 py-2 flex items-center gap-2">
                <Clock size={14} className="text-gray-400" />
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-16">Duration</span>
                <select
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="text-sm text-gray-800 dark:text-gray-200 bg-transparent focus:outline-none cursor-pointer"
                >
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={45}>45 minutes</option>
                  <option value={60}>1 hour</option>
                  <option value={90}>1.5 hours</option>
                  <option value={120}>2 hours</option>
                </select>
                {proposedTime && (
                  <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
                    Suggested: {proposedTime.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>
            )}

            {/* Message/Agenda body - not for call */}
            {activeMode !== 'call' && (
              <div className="px-4 py-3">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                  {activeMode === 'chat' ? 'Message' : 'Agenda'}
                </div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={activeMode === 'chat' ? 6 : 8}
                  className="w-full text-sm text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-[#5b5fc7]/50 resize-none leading-relaxed"
                  placeholder={activeMode === 'chat' ? 'Type your message...' : 'Meeting agenda and talking points...'}
                />
              </div>
            )}

            {/* Call mode info */}
            {activeMode === 'call' && (
              <div className="px-4 py-6 text-center">
                <Phone size={32} className="mx-auto text-[#5b5fc7] mb-3" />
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Start a Teams call with <span className="font-medium">{attendeesArray[0] || 'the attendee'}</span>
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Teams will open and initiate the call
                </p>
              </div>
            )}

            {/* Footer - Actions */}
            <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2">
                {/* Primary action button with dropdown */}
                <div className="relative">
                  <div className="flex">
                    <button
                      onClick={handlePrimaryAction}
                      className="flex items-center gap-2 px-4 py-2 bg-[#5b5fc7] hover:bg-[#4b4fb7] text-white text-sm font-medium rounded-l-lg transition-colors"
                    >
                      {activeMode === 'chat' ? (
                        <>
                          <MessageSquare size={14} />
                          Open Chat
                        </>
                      ) : activeMode === 'call' ? (
                        <>
                          <Phone size={14} />
                          Start Call
                        </>
                      ) : (
                        <>
                          <Video size={14} />
                          Schedule
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => setShowOptions(!showOptions)}
                      className="px-2 py-2 bg-[#5b5fc7] hover:bg-[#4b4fb7] text-white rounded-r-lg border-l border-[#4b4fb7] transition-colors"
                    >
                      <ChevronDown size={14} />
                    </button>
                  </div>

                  {/* Options dropdown */}
                  <AnimatePresence>
                    {showOptions && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="absolute bottom-full left-0 mb-1 bg-white dark:bg-slate-700 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 overflow-hidden min-w-[180px] z-10"
                      >
                        <button
                          onClick={() => { handleOpenTeamsChat(); setShowOptions(false); }}
                          className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-600 flex items-center gap-2"
                        >
                          <MessageSquare size={14} />
                          Open Teams Chat
                        </button>
                        <button
                          onClick={() => { handleOpenTeamsMeeting(); setShowOptions(false); }}
                          className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-600 flex items-center gap-2"
                        >
                          <Video size={14} />
                          Schedule Meeting
                        </button>
                        <button
                          onClick={() => { handleOpenTeamsCall(); setShowOptions(false); }}
                          className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-600 flex items-center gap-2"
                        >
                          <Phone size={14} />
                          Start Call
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

TeamsComposer.displayName = 'TeamsComposer';

export default TeamsComposer;
