import React, { useEffect } from 'react';
import { Zap, Cloud, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export type AIModelType =
  | 'local'
  | 'openai'
  | 'auto'
  | 'microsoft'
  | 'qwen'
  | 'mistral'
  | 'ibm';

interface AIModelSelectionProps {
  onSelect: (modelType: AIModelType) => void;
  onClose?: () => void;
}

export const AIModelSelection: React.FC<AIModelSelectionProps> = ({ onSelect }) => {
  // Auto-select local since OpenAI is disabled
  useEffect(() => {
    // Automatically select local after a short delay to show the UI briefly
    const timer = setTimeout(() => {
      onSelect('local');
    }, 1000);

    return () => clearTimeout(timer);
  }, [onSelect]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 p-8 rounded-xl shadow-2xl max-w-2xl w-full mx-4 border border-gray-200 dark:border-gray-700">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Zap className="w-8 h-8 text-green-500" />
            <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-100">AI Engine: Local AI</h2>
          </div>
          <p className="text-gray-600 dark:text-gray-400 text-lg max-w-2xl mx-auto">
            ChurnVision is configured to use local AI for optimal privacy and offline operation.
          </p>
        </div>

        <div className="mb-8">
          {/* Local AI Option - Only Option */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative p-6 rounded-xl border-2 border-green-500 bg-green-50 dark:bg-green-900/20"
          >
            {/* Recommended Badge */}
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
              <span className="bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
                ACTIVE
              </span>
            </div>

            <div className="flex items-start gap-4 mt-2">
              <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900/30">
                <Cloud className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">
                  Local AI 
                </h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                  Privacy-focused AI powered by local models. Complete offline operation and data privacy. 
                </p>
                
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-gray-700 dark:text-gray-300">Complete Privacy</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-gray-700 dark:text-gray-300">Offline Operation</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-gray-700 dark:text-gray-300">No Data Transmission</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-gray-700 dark:text-gray-300">Secure Processing</span>
                  </div>
                </div>

                <div className="text-xs text-gray-500 dark:text-gray-400 bg-green-50 dark:bg-green-900/20 p-2 rounded">
                  <strong>Requirements:</strong> Local Ollama installation, included in your license
                </div>
              </div>
            </div>
            
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute top-3 right-3"
            >
              <CheckCircle className="w-6 h-6 text-green-500" />
            </motion.div>
          </motion.div>
        </div>

        <div className="text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Setting up your AI assistant...
          </p>
          <div className="flex justify-center">
            <div className="w-8 h-8 border-4 border-green-200 border-t-green-500 rounded-full animate-spin"></div>
          </div>
        </div>
      </div>
    </div>
  );
}; 
