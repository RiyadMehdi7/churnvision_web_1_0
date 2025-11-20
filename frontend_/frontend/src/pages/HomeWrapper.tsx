import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, Eye, Sparkles } from 'lucide-react';
import { Home } from './Home';
import { CustomizableHome } from './CustomizableHome';
import { useNavigate } from 'react-router-dom';

export const HomeWrapper: React.FC = () => {
  const navigate = useNavigate();
  const [isCustomizableView, setIsCustomizableView] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const [llmReady, setLlmReady] = useState<boolean>(true);
  const [checkingLlm, setCheckingLlm] = useState<boolean>(true);

  // Check if user has seen the customization intro
  useEffect(() => {
    const hasSeenIntro = localStorage.getItem('customization-intro-seen');
    if (!hasSeenIntro) {
      setShowIntro(true);
    }
  }, []);

  // First-run provisioning banner: check local LLM readiness
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    const check = async () => {
      try {
        const status = await (window as any).electronApi?.getLlmStatusNow?.();
        if (status && typeof status.ready === 'boolean') setLlmReady(!!status.ready);
      } catch {}
      setCheckingLlm(false);
    };
    check();
    try {
      unsubscribe = (window as any).electronApi?.llm?.onLlmStatusUpdate?.((st: any) => setLlmReady(!!st?.ready));
    } catch {}
    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  const handleToggleView = () => {
    setIsCustomizableView(!isCustomizableView);
    
    // Track usage
    const usage = JSON.parse(localStorage.getItem('customization-usage') || '{}');
    usage.toggleCount = (usage.toggleCount || 0) + 1;
    usage.lastToggle = new Date().toISOString();
    localStorage.setItem('customization-usage', JSON.stringify(usage));
  };

  const handleDismissIntro = () => {
    setShowIntro(false);
    localStorage.setItem('customization-intro-seen', 'true');
  };

  const handleTryCustomization = () => {
    setShowIntro(false);
    setIsCustomizableView(true);
    localStorage.setItem('customization-intro-seen', 'true');
  };

  return (
    <div className="relative">
      {/* LLM provisioning banner */}
      {!checkingLlm && !llmReady && (
        <div className="fixed top-0 inset-x-0 z-50 bg-yellow-100 dark:bg-yellow-900/50 border-b border-yellow-300 dark:border-yellow-800 text-yellow-900 dark:text-yellow-100">
          <div className="max-w-6xl mx-auto px-4 py-2 flex items-center justify-between">
            <span className="text-sm">
              Local AI model is not provisioned. Create it offline from the bundled Modelfile.
            </span>
            <div className="flex items-center gap-2">
              <button
                className="px-3 py-1 bg-yellow-600 text-white rounded-md text-sm hover:bg-yellow-700"
                onClick={async () => {
                  try {
                    const api = (window as any).electronApi?.llm;
                    await api?.provisionFromModelfile?.('churnvision-qwen3-4b', undefined);
                    await api?.retryInitialization?.();
                    const status = await (window as any).electronApi?.getLlmStatusNow?.();
                    setLlmReady(!!status?.ready);
                  } catch (e: any) {
                    alert(`Provisioning failed: ${e?.message || e}`);
                  }
                }}
              >
                Provision Model
              </button>
              <button
                className="px-3 py-1 border rounded-md text-sm hover:bg-yellow-50 dark:hover:bg-yellow-800"
                onClick={() => navigate('/settings')}
              >
                Open Settings
              </button>
            </div>
          </div>
        </div>
      )}
      {/* View Toggle Button (when not in customization mode) */}
      {!isCustomizableView && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="fixed top-4 right-4 z-40"
        >
          <button
            onClick={handleToggleView}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg shadow-lg hover:bg-blue-700 transition-all duration-200 hover:scale-105"
          >
            <Sparkles className="w-4 h-4" />
            <span className="font-medium">Try New Dashboard</span>
          </button>
        </motion.div>
      )}

      {/* Introduction Modal */}
      <AnimatePresence>
        {showIntro && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full p-8"
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                  Introducing Customizable Dashboards
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Experience the next generation of ChurnVision with personalized, role-based dashboards
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-800 rounded-lg flex items-center justify-center mx-auto mb-3">
                    <Settings className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    C-Level Mode
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Strategic overview with organizational insights and high-level metrics
                  </p>
                </div>

                <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <div className="w-12 h-12 bg-green-100 dark:bg-green-800 rounded-lg flex items-center justify-center mx-auto mb-3">
                    <Eye className="w-6 h-6 text-green-600 dark:text-green-400" />
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    D-Level Mode
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Detailed operational view with individual employee insights
                  </p>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Key Features:
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• Drag-and-drop widget customization</li>
                  <li>• AI-powered insights and recommendations</li>
                  <li>• Role-based widget availability</li>
                  <li>• Save and share custom layouts</li>
                  <li>• Real-time data integration</li>
                </ul>
              </div>

              <div className="flex items-center justify-between">
                <button
                  onClick={handleDismissIntro}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                >
                  Maybe Later
                </button>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={handleDismissIntro}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Keep Classic View
                  </button>
                  <button
                    onClick={handleTryCustomization}
                    className="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-200 font-medium"
                  >
                    Try It Now
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <AnimatePresence mode="wait">
        {isCustomizableView ? (
          <motion.div
            key="customizable"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            <CustomizableHome onToggleClassicView={handleToggleView} />
          </motion.div>
        ) : (
          <motion.div
            key="classic"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.3 }}
          >
            <Home />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
