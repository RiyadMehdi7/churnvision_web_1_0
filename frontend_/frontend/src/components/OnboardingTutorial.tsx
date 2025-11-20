import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  ArrowLeft,
  X,
  Play,
  Pause,
  CheckCircle,
  Lightbulb,
  Sparkles,
  Target,
  Users,
  BarChart3,
  Clock,
  UploadCloud,
  ShieldCheck,
  Brain,
  GitCompare,
  Zap,
  Activity,
  Bot
} from 'lucide-react';
import { cn } from '../lib/utils';
import { CustomizationMode } from '../contexts/HomeCustomizationContext';

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  content: React.ReactNode;
  target?: string; // CSS selector for highlighting
  position: 'center' | 'top' | 'bottom' | 'left' | 'right';
  action?: 'click' | 'hover' | 'drag' | 'none';
  mode?: CustomizationMode;
  optional?: boolean;
}

interface OnboardingTutorialProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  currentMode: CustomizationMode;
  onModeChange?: (mode: CustomizationMode) => void;
  className?: string;
}

export const OnboardingTutorial: React.FC<OnboardingTutorialProps> = ({
  isOpen,
  onClose,
  onComplete,
  currentMode,
  onModeChange: _,
  className
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);

  // Tutorial steps configuration
  const tutorialSteps: TutorialStep[] = [
    {
      id: 'welcome',
      title: 'Welcome to ChurnVision',
      description: 'Take a quick tour of the features that are available right now.',
      position: 'center',
      action: 'none',
      content: (
        <div className="text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <Sparkles className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Your Retention Command Center
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
            We&rsquo;ll highlight how to prepare your data, monitor churn risk, simulate interventions,
            and collaborate with the Echo AI assistant.
          </p>
          <div className="flex items-center justify-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
            <span className="flex items-center space-x-1">
              <Clock className="w-4 h-4" />
              <span>~3 minutes</span>
            </span>
            <span className="flex items-center space-x-1">
              <Target className="w-4 h-4" />
              <span>Product tour</span>
            </span>
          </div>
        </div>
      )
    },
    {
      id: 'data-readiness',
      title: 'Prepare Your Data',
      description: 'Upload and validate HR data before running predictions.',
      position: 'center',
      action: 'none',
      content: (
        <div>
          <div className="flex items-start gap-3 mb-4">
            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
              <UploadCloud className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-gray-100">Centralized onboarding</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Use the Data Management workspace to import CSV or Excel files, monitor upload progress,
                and store historical versions.
              </p>
            </div>
          </div>
          <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500 dark:text-emerald-400 mt-0.5" />
              <span><strong>Validation checks</strong> flag schema issues, missing columns, leakage risks, and empty datasets before training.</span>
            </li>
            <li className="flex items-start gap-2">
              <Users className="w-4 h-4 text-blue-500 dark:text-blue-300 mt-0.5" />
              <span><strong>Sample previews</strong> let you inspect employee rows and confirm mappings prior to ingestion.</span>
            </li>
            <li className="flex items-start gap-2">
              <Lightbulb className="w-4 h-4 text-amber-500 dark:text-amber-300 mt-0.5" />
              <span><strong>Guided fixes</strong> provide clear messaging so stakeholders know how to resolve each issue.</span>
            </li>
          </ul>
        </div>
      )
    },
    {
      id: 'risk-overview',
      title: 'Monitor Churn Risk',
      description: 'Track key churn metrics and AI insights on the Home dashboard.',
      position: 'center',
      action: 'none',
      content: (
        <div>
          <div className="flex items-start gap-3 mb-4">
            <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-gray-100">Live risk monitoring</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                The Home view surfaces risk distribution, dynamic thresholds, and autogenerated
                narrative commentary for your current dataset.
              </p>
            </div>
          </div>
          <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li className="flex items-start gap-2">
              <Brain className="w-4 h-4 text-purple-500 dark:text-purple-300 mt-0.5" />
              <span><strong>AI insights</strong> summarise department trends, risk drivers, and recommended focus areas.</span>
            </li>
            <li className="flex items-start gap-2">
              <Target className="w-4 h-4 text-rose-500 dark:text-rose-300 mt-0.5" />
              <span><strong>Dynamic thresholds</strong> adapt automatically so teams share a consistent definition of high, medium, and low risk.</span>
            </li>
            <li className="flex items-start gap-2">
              <Users className="w-4 h-4 text-slate-500 dark:text-slate-300 mt-0.5" />
              <span><strong>Employee search</strong> makes it easy to jump from overview metrics to individual profiles.</span>
            </li>
          </ul>
        </div>
      )
    },
    {
      id: 'scenario-playground',
      title: 'Experiment in the Playground',
      description: 'Model treatments, compare scenarios, and forecast retention impact.',
      position: 'center',
      action: 'none',
      content: (
        <div>
          <div className="flex items-start gap-3 mb-4">
            <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg flex items-center justify-center">
              <GitCompare className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-gray-100">Interactive scenario planning</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Select an employee to view current predictions, apply AI-recommended treatments,
                and track how survival curves shift over time.
              </p>
            </div>
          </div>
          <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li className="flex items-start gap-2">
              <Zap className="w-4 h-4 text-emerald-500 dark:text-emerald-300 mt-0.5" />
              <span><strong>Scenario comparison</strong> charts baseline vs. post-treatment retention with automatic top-line metrics.</span>
            </li>
            <li className="flex items-start gap-2">
              <Users className="w-4 h-4 text-teal-500 dark:text-teal-300 mt-0.5" />
              <span><strong>Mass treatment mode</strong> prioritizes cohorts, applies interventions in bulk, and reports aggregate ROI.</span>
            </li>
            <li className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500 dark:text-emerald-300 mt-0.5" />
              <span><strong>Leakage-safe simulations</strong> reuse the validated model and respect the data diagnostics you completed earlier.</span>
            </li>
          </ul>
        </div>
      )
    },
    {
      id: 'treatment-tracking',
      title: 'Track Outcomes & ROI',
      description: 'Follow up on applied treatments and measure impact over time.',
      position: 'center',
      action: 'none',
      content: (
        <div>
          <div className="flex items-start gap-3 mb-4">
            <div className="w-12 h-12 bg-orange-50 dark:bg-orange-900/20 rounded-lg flex items-center justify-center">
              <Activity className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-gray-100">Treatment tracker</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Review which actions were applied, how much value they generated, and which employees still need attention.
              </p>
            </div>
          </div>
          <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-500 dark:text-emerald-300 mt-0.5" />
              <span><strong>Outcome summaries</strong> capture post-treatment churn probability, ELTV lift, and ROI for every intervention.</span>
            </li>
            <li className="flex items-start gap-2">
              <Lightbulb className="w-4 h-4 text-amber-500 dark:text-amber-300 mt-0.5" />
              <span><strong>Prioritized follow-ups</strong> highlight employees still in queue and surface the highest value next steps.</span>
            </li>
            <li className="flex items-start gap-2">
              <Target className="w-4 h-4 text-rose-500 dark:text-rose-300 mt-0.5" />
              <span><strong>Budget awareness</strong> keeps track of treatment cost ceilings so teams stay within constraints.</span>
            </li>
          </ul>
        </div>
      )
    },
    {
      id: 'ai-assistant',
      title: 'Chat with Echo AI',
      description: 'Use the built-in Echo assistant for guidance, explanations, and quick reports.',
      position: 'center',
      action: 'none',
      content: (
        <div>
          <div className="flex items-start gap-3 mb-4">
            <div className="w-12 h-12 bg-sky-50 dark:bg-sky-900/20 rounded-lg flex items-center justify-center">
              <Bot className="w-6 h-6 text-sky-600 dark:text-sky-400" />
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-gray-100">Echo assistant</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Ask natural-language questions about churn metrics, treatments, and data quality. Echo replies with timestamps, intent labels, and confidence cues for transparency.
              </p>
            </div>
          </div>
          <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li className="flex items-start gap-2">
              <Lightbulb className="w-4 h-4 text-amber-500 dark:text-amber-300 mt-0.5" />
              <span><strong>Explainability</strong>—request breakdowns of why an employee is high risk or how a metric was calculated.</span>
            </li>
            <li className="flex items-start gap-2">
              <Target className="w-4 h-4 text-rose-500 dark:text-rose-300 mt-0.5" />
              <span><strong>Contextual prompts</strong> keep track of recent treatments, validation results, and dashboard insights.</span>
            </li>
            <li className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500 dark:text-emerald-300 mt-0.5" />
              <span><strong>Accuracy reminders</strong> appear in the chat footer so end users know when to double-check responses.</span>
            </li>
          </ul>
        </div>
      )
    },
    {
      id: 'completion',
      title: 'You&rsquo;re Ready to Go',
      description: 'Put your data, insights, and interventions to work.',
      position: 'center',
      action: 'none',
      content: (
        <div className="text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Next Steps
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
            Start by validating your latest dataset, then monitor the Home dashboard, explore the Playground,
            and keep the Echo assistant handy for on-the-fly questions.
          </p>
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-left">
            <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
              Helpful reminders
            </h4>
            <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
              <li>• Re-run validation whenever a new file is uploaded.</li>
              <li>• Use scenario snapshots to explain proposed interventions.</li>
              <li>• Track applied treatments so ROI stays visible to stakeholders.</li>
              <li>• Reference the chat disclaimer before you share AI-generated output.</li>
            </ul>
          </div>
        </div>
      )
    }
  ];

  // Filter steps based on current mode
  const relevantSteps = tutorialSteps.filter(step => 
    !step.mode || step.mode === currentMode
  );

  // Auto-play functionality
  useEffect(() => {
    if (!isPlaying || !isOpen) return;

    const timer = setTimeout(() => {
      if (currentStep < relevantSteps.length - 1) {
        setCurrentStep(prev => prev + 1);
      } else {
        setIsPlaying(false);
      }
    }, 5000); // 5 seconds per step

    return () => clearTimeout(timer);
  }, [currentStep, isPlaying, isOpen, relevantSteps.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyPress = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight':
        case ' ':
          e.preventDefault();
          handleNext();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          handlePrevious();
          break;
        case 'Escape':
          e.preventDefault();
          setShowSkipConfirm(true);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isOpen, currentStep]);

  // Event handlers
  const handleNext = useCallback(() => {
    if (currentStep < relevantSteps.length - 1) {
      const stepId = relevantSteps[currentStep].id;
      setCompletedSteps(prev => new Set([...prev, stepId]));
      setCurrentStep(prev => prev + 1);
    } else {
      handleComplete();
    }
  }, [currentStep, relevantSteps]);

  const handlePrevious = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);

  const handleComplete = useCallback(() => {
    // Mark tutorial as completed
    localStorage.setItem('tutorial-completed', 'true');
    localStorage.setItem('tutorial-completion-date', new Date().toISOString());
    
    // Track completion
    const usage = JSON.parse(localStorage.getItem('tutorial-usage') || '{}');
    usage.completed = true;
    usage.completionDate = new Date().toISOString();
    usage.stepsCompleted = completedSteps.size;
    localStorage.setItem('tutorial-usage', JSON.stringify(usage));
    
    onComplete();
  }, [completedSteps.size, onComplete]);

  const handleSkip = useCallback(() => {
    // Track skip
    const usage = JSON.parse(localStorage.getItem('tutorial-usage') || '{}');
    usage.skipped = true;
    usage.skipDate = new Date().toISOString();
    usage.stepsCompleted = completedSteps.size;
    localStorage.setItem('tutorial-usage', JSON.stringify(usage));
    
    onClose();
  }, [completedSteps.size, onClose]);

  const currentStepData = relevantSteps[currentStep];
  const progress = ((currentStep + 1) / relevantSteps.length) * 100;

  if (!isOpen || !currentStepData) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      >
        {/* Tutorial Modal */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className={cn(
            "bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden",
            className
          )}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Step {currentStep + 1} of {relevantSteps.length}
                </div>
                <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 max-w-32">
                  <motion.div
                    className="bg-blue-600 h-2 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setShowSkipConfirm(true)}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded"
                  title="Close Tutorial"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-8">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                {currentStepData.title}
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                {currentStepData.description}
              </p>
            </div>

            <div className="mb-8">
              {currentStepData.content}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600">
            <div className="flex items-center justify-between">
              <button
                onClick={handlePrevious}
                disabled={currentStep === 0}
                className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Previous</span>
              </button>

              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setShowSkipConfirm(true)}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                >
                  Skip Tutorial
                </button>
                <button
                  onClick={handleNext}
                  className="flex items-center space-x-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  <span>
                    {currentStep === relevantSteps.length - 1 ? 'Complete' : 'Next'}
                  </span>
                  {currentStep < relevantSteps.length - 1 && <ArrowRight className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Skip Confirmation */}
        <AnimatePresence>
          {showSkipConfirm && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center"
            >
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
                  Skip Tutorial?
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Are you sure you want to skip the tutorial? You can always access it later 
                  from the help menu.
                </p>
                <div className="flex items-center justify-end space-x-3">
                  <button
                    onClick={() => setShowSkipConfirm(false)}
                    className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                  >
                    Continue Tutorial
                  </button>
                  <button
                    onClick={handleSkip}
                    className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                  >
                    Skip Tutorial
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
};