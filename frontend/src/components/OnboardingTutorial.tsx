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
  Bot,
  ChevronRight
} from 'lucide-react';
import { cn } from '../lib/utils';
import { CustomizationMode } from '../contexts/HomeCustomizationContext';

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  content: React.ReactNode;
  icon: React.ReactNode;
  gradient: string;
  accentColor: string;
  target?: string;
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

// Feature card component for step content
const FeatureCard = ({
  icon,
  title,
  description,
  accentColor
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  accentColor: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex items-start gap-4 p-4 rounded-xl bg-white/50 dark:bg-white/5 backdrop-blur-sm border border-gray-100 dark:border-white/10 hover:border-gray-200 dark:hover:border-white/20 transition-all duration-300"
  >
    <div className={cn(
      "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
      accentColor
    )}>
      {icon}
    </div>
    <div>
      <h4 className="font-semibold text-gray-900 dark:text-white text-sm mb-1">{title}</h4>
      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{description}</p>
    </div>
  </motion.div>
);

// Step indicator dot component
const StepDot = ({
  isActive,
  isCompleted,
  onClick,
  index
}: {
  isActive: boolean;
  isCompleted: boolean;
  onClick: () => void;
  index: number;
}) => (
  <motion.button
    onClick={onClick}
    className={cn(
      "relative w-3 h-3 rounded-full transition-all duration-300",
      isActive
        ? "bg-white scale-125"
        : isCompleted
          ? "bg-white/60"
          : "bg-white/30 hover:bg-white/40"
    )}
    whileHover={{ scale: 1.2 }}
    whileTap={{ scale: 0.9 }}
    aria-label={`Go to step ${index + 1}`}
  >
    {isActive && (
      <motion.div
        layoutId="activeDot"
        className="absolute inset-0 rounded-full bg-white"
        initial={false}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      />
    )}
    {isCompleted && !isActive && (
      <CheckCircle className="w-3 h-3 text-white" />
    )}
  </motion.button>
);

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
  const [direction, setDirection] = useState(0);

  // Tutorial steps configuration with enhanced visuals
  const tutorialSteps: TutorialStep[] = [
    {
      id: 'welcome',
      title: 'Welcome to ChurnVision',
      description: 'Your AI-powered retention command center',
      icon: <Sparkles className="w-8 h-8 text-white" />,
      gradient: 'from-violet-600 via-purple-600 to-indigo-600',
      accentColor: 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400',
      position: 'center',
      action: 'none',
      content: (
        <div className="space-y-6">
          <p className="text-lg text-gray-600 dark:text-gray-300 leading-relaxed">
            Take a quick tour of the features that help you predict, prevent, and manage employee churn effectively.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-violet-50 dark:bg-violet-900/20">
              <Clock className="w-5 h-5 text-violet-600 dark:text-violet-400" />
              <span className="text-sm text-gray-700 dark:text-gray-300">~3 min tour</span>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-violet-50 dark:bg-violet-900/20">
              <Target className="w-5 h-5 text-violet-600 dark:text-violet-400" />
              <span className="text-sm text-gray-700 dark:text-gray-300">7 key features</span>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'data-readiness',
      title: 'Prepare Your Data',
      description: 'Upload and validate HR data before predictions',
      icon: <UploadCloud className="w-8 h-8 text-white" />,
      gradient: 'from-blue-600 via-cyan-600 to-teal-600',
      accentColor: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
      position: 'center',
      action: 'none',
      content: (
        <div className="space-y-4">
          <FeatureCard
            icon={<ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />}
            title="Smart Validation"
            description="Automatic schema checks, missing column detection, and leakage risk identification"
            accentColor="bg-emerald-100 dark:bg-emerald-900/30"
          />
          <FeatureCard
            icon={<Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
            title="Data Preview"
            description="Inspect employee rows and confirm column mappings before ingestion"
            accentColor="bg-blue-100 dark:bg-blue-900/30"
          />
          <FeatureCard
            icon={<Lightbulb className="w-5 h-5 text-amber-600 dark:text-amber-400" />}
            title="Guided Fixes"
            description="Clear messaging helps stakeholders resolve data issues quickly"
            accentColor="bg-amber-100 dark:bg-amber-900/30"
          />
        </div>
      )
    },
    {
      id: 'risk-overview',
      title: 'Monitor Churn Risk',
      description: 'Track key metrics and AI insights on your dashboard',
      icon: <BarChart3 className="w-8 h-8 text-white" />,
      gradient: 'from-indigo-600 via-violet-600 to-purple-600',
      accentColor: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400',
      position: 'center',
      action: 'none',
      content: (
        <div className="space-y-4">
          <FeatureCard
            icon={<Brain className="w-5 h-5 text-purple-600 dark:text-purple-400" />}
            title="AI Insights"
            description="Auto-generated summaries of department trends and risk drivers"
            accentColor="bg-purple-100 dark:bg-purple-900/30"
          />
          <FeatureCard
            icon={<Target className="w-5 h-5 text-rose-600 dark:text-rose-400" />}
            title="Dynamic Thresholds"
            description="Adaptive risk levels ensure consistent team-wide definitions"
            accentColor="bg-rose-100 dark:bg-rose-900/30"
          />
          <FeatureCard
            icon={<Users className="w-5 h-5 text-slate-600 dark:text-slate-400" />}
            title="Quick Search"
            description="Jump from overview metrics to individual employee profiles instantly"
            accentColor="bg-slate-100 dark:bg-slate-900/30"
          />
        </div>
      )
    },
    {
      id: 'scenario-playground',
      title: 'Experiment in Playground',
      description: 'Model treatments and forecast retention impact',
      icon: <GitCompare className="w-8 h-8 text-white" />,
      gradient: 'from-emerald-600 via-teal-600 to-cyan-600',
      accentColor: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
      position: 'center',
      action: 'none',
      content: (
        <div className="space-y-4">
          <FeatureCard
            icon={<Zap className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />}
            title="Scenario Comparison"
            description="Compare baseline vs post-treatment retention with automated metrics"
            accentColor="bg-emerald-100 dark:bg-emerald-900/30"
          />
          <FeatureCard
            icon={<Users className="w-5 h-5 text-teal-600 dark:text-teal-400" />}
            title="Mass Treatment"
            description="Prioritize cohorts, apply bulk interventions, and report aggregate ROI"
            accentColor="bg-teal-100 dark:bg-teal-900/30"
          />
          <FeatureCard
            icon={<ShieldCheck className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />}
            title="Safe Simulations"
            description="Leakage-safe predictions that respect your validated data"
            accentColor="bg-cyan-100 dark:bg-cyan-900/30"
          />
        </div>
      )
    },
    {
      id: 'treatment-tracking',
      title: 'Track Outcomes & ROI',
      description: 'Measure impact and follow up on interventions',
      icon: <Activity className="w-8 h-8 text-white" />,
      gradient: 'from-orange-600 via-amber-600 to-yellow-600',
      accentColor: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
      position: 'center',
      action: 'none',
      content: (
        <div className="space-y-4">
          <FeatureCard
            icon={<CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />}
            title="Outcome Summaries"
            description="Track churn probability changes, ELTV lift, and ROI per intervention"
            accentColor="bg-emerald-100 dark:bg-emerald-900/30"
          />
          <FeatureCard
            icon={<Lightbulb className="w-5 h-5 text-amber-600 dark:text-amber-400" />}
            title="Smart Follow-ups"
            description="Surface employees still in queue with highest-value next steps"
            accentColor="bg-amber-100 dark:bg-amber-900/30"
          />
          <FeatureCard
            icon={<Target className="w-5 h-5 text-rose-600 dark:text-rose-400" />}
            title="Budget Tracking"
            description="Monitor treatment costs to stay within organizational constraints"
            accentColor="bg-rose-100 dark:bg-rose-900/30"
          />
        </div>
      )
    },
    {
      id: 'ai-assistant',
      title: 'Chat with Echo AI',
      description: 'Your intelligent retention assistant',
      icon: <Bot className="w-8 h-8 text-white" />,
      gradient: 'from-sky-600 via-blue-600 to-indigo-600',
      accentColor: 'bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400',
      position: 'center',
      action: 'none',
      content: (
        <div className="space-y-4">
          <FeatureCard
            icon={<Lightbulb className="w-5 h-5 text-amber-600 dark:text-amber-400" />}
            title="Explainability"
            description="Get clear breakdowns of why employees are flagged as high risk"
            accentColor="bg-amber-100 dark:bg-amber-900/30"
          />
          <FeatureCard
            icon={<Target className="w-5 h-5 text-rose-600 dark:text-rose-400" />}
            title="Context Aware"
            description="Remembers recent treatments, validations, and dashboard insights"
            accentColor="bg-rose-100 dark:bg-rose-900/30"
          />
          <FeatureCard
            icon={<ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />}
            title="Transparency"
            description="Confidence indicators help you know when to verify AI responses"
            accentColor="bg-emerald-100 dark:bg-emerald-900/30"
          />
        </div>
      )
    },
    {
      id: 'completion',
      title: "You're Ready!",
      description: 'Start reducing churn today',
      icon: <CheckCircle className="w-8 h-8 text-white" />,
      gradient: 'from-green-600 via-emerald-600 to-teal-600',
      accentColor: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
      position: 'center',
      action: 'none',
      content: (
        <div className="space-y-6">
          <p className="text-lg text-gray-600 dark:text-gray-300 leading-relaxed">
            You&apos;re all set to start predicting and preventing employee churn.
          </p>
          <div className="p-5 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-200 dark:border-emerald-800/50">
            <h4 className="font-semibold text-emerald-900 dark:text-emerald-100 mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Quick Start Checklist
            </h4>
            <ul className="space-y-2">
              {[
                'Upload and validate your HR dataset',
                'Review the risk dashboard for insights',
                'Explore scenarios in the Playground',
                'Ask Echo AI for recommendations'
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-emerald-800 dark:text-emerald-200">
                  <ChevronRight className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  {item}
                </li>
              ))}
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
        setDirection(1);
        setCurrentStep(prev => prev + 1);
      } else {
        setIsPlaying(false);
      }
    }, 6000);

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

  const handleNext = useCallback(() => {
    if (currentStep < relevantSteps.length - 1) {
      const stepId = relevantSteps[currentStep].id;
      setCompletedSteps(prev => new Set([...prev, stepId]));
      setDirection(1);
      setCurrentStep(prev => prev + 1);
    } else {
      handleComplete();
    }
  }, [currentStep, relevantSteps]);

  const handlePrevious = useCallback(() => {
    if (currentStep > 0) {
      setDirection(-1);
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);

  const handleGoToStep = useCallback((index: number) => {
    setDirection(index > currentStep ? 1 : -1);
    setCurrentStep(index);
  }, [currentStep]);

  const handleComplete = useCallback(() => {
    localStorage.setItem('tutorial-completed', 'true');
    localStorage.setItem('tutorial-completion-date', new Date().toISOString());

    const usage = JSON.parse(localStorage.getItem('tutorial-usage') || '{}');
    usage.completed = true;
    usage.completionDate = new Date().toISOString();
    usage.stepsCompleted = completedSteps.size;
    localStorage.setItem('tutorial-usage', JSON.stringify(usage));

    onComplete();
  }, [completedSteps.size, onComplete]);

  const handleSkip = useCallback(() => {
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

  // Animation variants
  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 100 : -100,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 100 : -100,
      opacity: 0,
    }),
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      >
        {/* Backdrop with blur */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowSkipConfirm(true)}
        />

        {/* Main Modal */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className={cn(
            "relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white dark:bg-gray-900 shadow-2xl",
            className
          )}
        >
          {/* Gradient Header */}
          <div className={cn(
            "relative px-6 py-8 sm:px-8 sm:py-10 bg-gradient-to-br",
            currentStepData.gradient
          )}>
            {/* Decorative elements */}
            <div className="absolute inset-0 overflow-hidden">
              <div className="absolute -top-24 -right-24 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
              <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
            </div>

            {/* Header Controls */}
            <div className="relative flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                  title={isPlaying ? 'Pause' : 'Auto-play'}
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
              </div>
              <button
                onClick={() => setShowSkipConfirm(true)}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Icon and Title */}
            <div className="relative">
              <motion.div
                key={`icon-${currentStep}`}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center mb-5 shadow-lg"
              >
                {currentStepData.icon}
              </motion.div>

              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={`title-${currentStep}`}
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.3 }}
                >
                  <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">
                    {currentStepData.title}
                  </h2>
                  <p className="text-white/80 text-base sm:text-lg">
                    {currentStepData.description}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Progress dots */}
            <div className="relative flex items-center justify-center gap-2 mt-6">
              {relevantSteps.map((step, index) => (
                <StepDot
                  key={step.id}
                  index={index}
                  isActive={index === currentStep}
                  isCompleted={completedSteps.has(step.id)}
                  onClick={() => handleGoToStep(index)}
                />
              ))}
            </div>
          </div>

          {/* Content Area */}
          <div className="px-6 py-6 sm:px-8 sm:py-8 max-h-[40vh] overflow-y-auto">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={`content-${currentStep}`}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3 }}
              >
                {currentStepData.content}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 sm:px-8 sm:py-5 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between">
              {/* Left side - progress text */}
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {currentStep + 1} of {relevantSteps.length}
                </span>
                <div className="hidden sm:block w-24 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <motion.div
                    className={cn("h-full rounded-full bg-gradient-to-r", currentStepData.gradient)}
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>

              {/* Right side - navigation buttons */}
              <div className="flex items-center gap-3">
                {currentStep > 0 && (
                  <motion.button
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    onClick={handlePrevious}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span className="hidden sm:inline">Back</span>
                  </motion.button>
                )}

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleNext}
                  className={cn(
                    "flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-xl shadow-lg transition-all",
                    "bg-gradient-to-r",
                    currentStepData.gradient,
                    "hover:shadow-xl hover:brightness-110"
                  )}
                >
                  <span>
                    {currentStep === relevantSteps.length - 1 ? 'Get Started' : 'Continue'}
                  </span>
                  {currentStep < relevantSteps.length - 1 && <ArrowRight className="w-4 h-4" />}
                </motion.button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Skip Confirmation Modal */}
        <AnimatePresence>
          {showSkipConfirm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-10 flex items-center justify-center p-4"
            >
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/40"
                onClick={() => setShowSkipConfirm(false)}
              />
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 max-w-sm w-full"
              >
                <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-4 mx-auto">
                  <Lightbulb className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2 text-center">
                  Skip the Tour?
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6 text-center text-sm">
                  You can always restart the tutorial from the settings menu.
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowSkipConfirm(false)}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    Continue Tour
                  </button>
                  <button
                    onClick={handleSkip}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-rose-500 to-orange-500 rounded-xl hover:brightness-110 transition-all shadow-lg"
                  >
                    Skip
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
};
