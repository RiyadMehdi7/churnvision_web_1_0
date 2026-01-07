/**
 * ActionProposalCard
 *
 * Sleek action proposal card for AI-suggested actions.
 * Supports email drafts, meeting requests, and task creation.
 * Email proposals open an Outlook-style composer.
 */

import { memo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import {
  Mail,
  Calendar,
  CheckSquare,
  Bell,
  FileText,
  Check,
  X,
  Edit3,
  ChevronDown,
  ChevronUp,
  User,
  Clock,
  Sparkles,
  ExternalLink,
  Pencil,
} from 'lucide-react';
import type { ActionProposal, ActionType } from '@/types/agent';
import { EmailComposer } from './EmailComposer';
import { TeamsComposer } from './TeamsComposer';

const ACTION_ICONS: Record<ActionType, LucideIcon> = {
  email: Mail,
  meeting: Calendar,
  task: CheckSquare,
  notification: Bell,
  report: FileText,
};

interface ActionProposalCardProps {
  proposal: ActionProposal;
  onApprove: (proposal: ActionProposal) => Promise<boolean>;
  onReject: (proposal: ActionProposal) => Promise<void>;
  onEdit: (proposal: ActionProposal) => void;
}

export const ActionProposalCard = memo<ActionProposalCardProps>(({
  proposal,
  onApprove,
  onReject,
  onEdit,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  // Initialize editedContent based on proposal type
  const getInitialContent = () => {
    if (proposal.type === 'email') return proposal.metadata.body || '';
    if (proposal.type === 'meeting') return proposal.metadata.agenda || '';
    if (proposal.type === 'task') return proposal.description || '';
    return proposal.metadata.body || proposal.metadata.agenda || '';
  };
  const [editedContent, setEditedContent] = useState(getInitialContent);
  const [showEmailComposer, setShowEmailComposer] = useState(false);
  const [showTeamsComposer, setShowTeamsComposer] = useState(false);

  const IconComponent = ACTION_ICONS[proposal.type];

  const handleOpenComposer = useCallback(() => {
    setShowEmailComposer(true);
  }, []);

  const handleOpenTeamsComposer = useCallback(() => {
    setShowTeamsComposer(true);
  }, []);

  const handleEmailSent = useCallback(async () => {
    await onApprove(proposal);
    setShowEmailComposer(false);
  }, [onApprove, proposal]);

  const handleMeetingSent = useCallback(async () => {
    await onApprove(proposal);
    setShowTeamsComposer(false);
  }, [onApprove, proposal]);

  const renderEmailPreview = () => {
    const { to, subject, body } = proposal.metadata;
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-400 dark:text-gray-500">To:</span>
          <div className="flex flex-wrap gap-1">
            {to?.map((recipient: string, idx: number) => (
              <span key={idx} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-300">
                {recipient}
              </span>
            ))}
          </div>
        </div>
        <div className="text-xs">
          <span className="text-gray-400 dark:text-gray-500">Subject: </span>
          <span className="text-gray-700 dark:text-gray-200 font-medium">{subject}</span>
        </div>
        <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700">
          {isEditing ? (
            <textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              className="w-full h-32 text-xs text-gray-600 dark:text-gray-300 bg-transparent resize-none focus:outline-none"
            />
          ) : (
            <p className="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap line-clamp-4">
              {body}
            </p>
          )}
        </div>
      </div>
    );
  };

  const renderMeetingPreview = () => {
    const { attendees, proposedTime, duration, agenda } = proposal.metadata;
    return (
      <div className="space-y-2 text-xs">
        <div className="flex items-center gap-2">
          <User size={12} className="text-gray-400" />
          <div className="flex flex-wrap gap-1">
            {attendees?.map((a: string, idx: number) => (
              <span key={idx} className="px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-900/20 rounded text-emerald-600 dark:text-emerald-400">
                {a}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Clock size={12} className="text-gray-400" />
            <span className="text-gray-600 dark:text-gray-300">
              {proposedTime ? new Date(proposedTime).toLocaleString(undefined, {
                weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
              }) : 'TBD'}
            </span>
          </div>
          {duration && <span className="text-gray-400">({duration} min)</span>}
        </div>
        <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700">
          {isEditing ? (
            <textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              placeholder="Meeting agenda..."
              className="w-full h-24 text-xs text-gray-600 dark:text-gray-300 bg-transparent resize-none focus:outline-none"
            />
          ) : (
            <p className="text-gray-500 dark:text-gray-400 whitespace-pre-wrap line-clamp-3">
              {agenda || 'No agenda specified'}
            </p>
          )}
        </div>
      </div>
    );
  };

  const renderTaskPreview = () => {
    const { assignee, dueDate, priority } = proposal.metadata;
    return (
      <div className="space-y-2 text-xs">
        <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700">
          {isEditing ? (
            <textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              placeholder="Task description..."
              className="w-full h-20 text-xs text-gray-600 dark:text-gray-300 bg-transparent resize-none focus:outline-none"
            />
          ) : (
            <p className="text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{proposal.description}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {assignee && (
            <span className="flex items-center gap-1 text-gray-500">
              <User size={12} /> {assignee}
            </span>
          )}
          {dueDate && (
            <span className="flex items-center gap-1 text-gray-500">
              <Clock size={12} /> {new Date(dueDate).toLocaleDateString()}
            </span>
          )}
          {priority && (
            <span className={`px-1.5 py-0.5 rounded font-medium ${
              priority === 'high' ? 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400' :
              priority === 'medium' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400' :
              'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
            }`}>
              {priority}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 overflow-hidden"
      >
        {/* Header */}
        <div
          className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-gradient-to-br from-emerald-400 to-blue-500 text-white">
              <IconComponent size={14} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  {proposal.title}
                </span>
                <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                  <Sparkles size={10} /> AI
                </span>
              </div>
              {proposal.metadata.targetEmployee && (
                <p className="text-[10px] text-gray-500">
                  For: {proposal.metadata.targetEmployee.name}
                </p>
              )}
            </div>
          </div>
          {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </div>

        {/* Content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              exit={{ height: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="px-3 pb-3">
                <div className="mb-3">
                  {proposal.type === 'email' && renderEmailPreview()}
                  {proposal.type === 'meeting' && renderMeetingPreview()}
                  {proposal.type === 'task' && renderTaskPreview()}
                  {!['email', 'meeting', 'task'].includes(proposal.type) && (
                    <p className="text-xs text-gray-600 dark:text-gray-300">{proposal.description}</p>
                  )}
                </div>

                {/* Actions */}
                {proposal.status === 'pending' && (
                  <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-gray-100 dark:border-gray-700">
                    <button
                      onClick={() => onReject(proposal)}
                      className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      <X size={12} className="inline mr-0.5" /> Reject
                    </button>

                    {proposal.type === 'email' ? (
                      <>
                        <button
                          onClick={() => {
                            if (isEditing) {
                              onEdit({ ...proposal, metadata: { ...proposal.metadata, body: editedContent } });
                            }
                            setIsEditing(!isEditing);
                          }}
                          className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                          <Edit3 size={12} className="inline mr-0.5" /> {isEditing ? 'Save' : 'Edit'}
                        </button>
                        <button
                          onClick={handleOpenComposer}
                          className="px-2.5 py-1 rounded text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center gap-1"
                        >
                          <Pencil size={12} /> Compose
                        </button>
                      </>
                    ) : proposal.type === 'meeting' ? (
                      <>
                        <button
                          onClick={() => {
                            if (isEditing) {
                              onEdit({ ...proposal, metadata: { ...proposal.metadata, agenda: editedContent } });
                            }
                            setIsEditing(!isEditing);
                          }}
                          className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                          <Edit3 size={12} className="inline mr-0.5" /> {isEditing ? 'Save' : 'Edit'}
                        </button>
                        <button
                          onClick={handleOpenTeamsComposer}
                          className="px-2.5 py-1 rounded text-xs font-medium bg-teams-purple hover:bg-teams-purple/90 text-white transition-colors flex items-center gap-1"
                        >
                          <Calendar size={12} /> Open in Teams
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            if (isEditing) {
                              // For tasks, update description; for others, update metadata.body
                              if (proposal.type === 'task') {
                                onEdit({ ...proposal, description: editedContent });
                              } else {
                                onEdit({ ...proposal, metadata: { ...proposal.metadata, body: editedContent } });
                              }
                            }
                            setIsEditing(!isEditing);
                          }}
                          className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                          <Edit3 size={12} className="inline mr-0.5" /> {isEditing ? 'Save' : 'Edit'}
                        </button>
                        <button
                          onClick={() => onApprove(proposal)}
                          className="px-2.5 py-1 rounded text-xs font-medium bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
                        >
                          <Check size={12} className="inline mr-0.5" /> Approve
                        </button>
                      </>
                    )}
                  </div>
                )}

                {proposal.status === 'approved' && (
                  <div className="flex items-center gap-1.5 pt-2 border-t border-gray-100 dark:border-gray-700 text-emerald-500 text-xs">
                    <Check size={12} /> {proposal.type === 'email' ? 'Email Opened' : 'Sent'}
                  </div>
                )}

                {proposal.status === 'rejected' && (
                  <div className="flex items-center gap-1.5 pt-2 border-t border-gray-100 dark:border-gray-700 text-gray-400 text-xs">
                    <X size={12} /> Rejected
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Email Composer Modal */}
      <AnimatePresence>
        {showEmailComposer && proposal.type === 'email' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => setShowEmailComposer(false)}
          >
            <div onClick={(e) => e.stopPropagation()}>
              <EmailComposer
                to={proposal.metadata.to || []}
                cc={proposal.metadata.cc || []}
                subject={proposal.metadata.subject || ''}
                body={isEditing ? editedContent : (proposal.metadata.body || '')}
                employeeName={proposal.metadata.targetEmployee?.name}
                onClose={() => setShowEmailComposer(false)}
                onSent={handleEmailSent}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Teams Composer Modal */}
      <AnimatePresence>
        {showTeamsComposer && proposal.type === 'meeting' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => setShowTeamsComposer(false)}
          >
            <div onClick={(e) => e.stopPropagation()}>
              <TeamsComposer
                attendees={proposal.metadata.attendees || []}
                subject={proposal.title || ''}
                message={isEditing ? editedContent : (proposal.metadata.agenda || '')}
                duration={proposal.metadata.duration}
                proposedTime={proposal.metadata.proposedTime ? new Date(proposal.metadata.proposedTime) : undefined}
                employeeName={proposal.metadata.targetEmployee?.name}
                mode="meeting"
                onClose={() => setShowTeamsComposer(false)}
                onSent={handleMeetingSent}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
});

ActionProposalCard.displayName = 'ActionProposalCard';

export default ActionProposalCard;
