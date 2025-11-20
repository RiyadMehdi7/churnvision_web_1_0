import React from 'react';
import { motion } from 'framer-motion';
import { Brain, BarChart3, TrendingUp, Users } from 'lucide-react';
import { DeepAnalysisState } from './TabInterfaceController';

interface DeepAnalysisTabProps {
    deepAnalysisState: DeepAnalysisState;
    updateDeepAnalysisState: (state: Partial<DeepAnalysisState>) => void;
}

export const DeepAnalysisTab: React.FC<DeepAnalysisTabProps> = () => {
    return (
        <div className="h-full flex flex-col p-6 bg-gray-50 dark:bg-gray-900">
            {/* Header */}
            <div className="mb-6">
                <div className="bg-gradient-to-r from-purple-900 via-purple-800 to-purple-900 -mx-6 -mt-6 px-8 py-8 border-b border-purple-700/50 relative overflow-hidden">
                    <div className="absolute inset-0 overflow-hidden">
                        <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
                        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-500/50 to-transparent"></div>
                    </div>

                    <div className="relative">
                        <div className="flex justify-between items-center">
                            <div>
                                <div className="flex items-center gap-3 mb-3">
                                    <motion.h1
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-200 via-purple-400 to-purple-200 animate-gradient"
                                    >
                                        Deep Analysis - AI-Powered Organizational Insights
                                    </motion.h1>
                                    <div className="flex items-center gap-2">
                                        <motion.span
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: 0.2 }}
                                            className="relative group"
                                        >
                                            <span className="px-2.5 py-1 text-xs font-semibold bg-purple-500/10 text-purple-300 rounded-md border border-purple-500/30 relative z-10 flex items-center gap-1.5 shadow-sm group-hover:bg-purple-500/20 transition-all duration-200">
                                                <Brain className="h-2 w-2" />
                                                AI-Powered
                                            </span>
                                            <div className="absolute inset-0 bg-purple-500/20 rounded-md blur-sm opacity-70 group-hover:opacity-100 transition-opacity duration-200"></div>
                                        </motion.span>
                                    </div>
                                </div>
                                <motion.p
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.1 }}
                                    className="text-base text-purple-200 max-w-2xl"
                                >
                                    Leverage advanced LLM capabilities to analyze organizational patterns, engagement data, and workforce trends for strategic decision-making.
                                </motion.p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Coming Soon Content */}
            <div className="flex-1 flex items-center justify-center">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="text-center max-w-2xl mx-auto"
                >
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 shadow-lg border border-gray-200 dark:border-gray-700">
                        <div className="flex justify-center mb-6">
                            <div className="relative">
                                <div className="w-24 h-24 bg-gradient-to-br from-purple-500 to-blue-600 rounded-full flex items-center justify-center">
                                    <Brain className="w-12 h-12 text-white" />
                                </div>
                                <div className="absolute -top-2 -right-2 w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center">
                                    <span className="text-xs font-bold text-gray-900">AI</span>
                                </div>
                            </div>
                        </div>

                        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                            Deep Analysis Coming Soon
                        </h2>

                        <p className="text-gray-600 dark:text-gray-400 mb-8 leading-relaxed">
                            We're building powerful AI-driven analysis capabilities that will help you understand your organization at a deeper level.
                            This tab will soon feature advanced analytics for churn patterns, engagement correlations, and strategic workforce insights.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                            <div className="text-center">
                                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mx-auto mb-3">
                                    <BarChart3 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                                </div>
                                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Pattern Analysis</h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400">Identify hidden patterns in churn and engagement data</p>
                            </div>

                            <div className="text-center">
                                <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center mx-auto mb-3">
                                    <TrendingUp className="w-6 h-6 text-green-600 dark:text-green-400" />
                                </div>
                                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Trend Forecasting</h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400">Predict future workforce trends and risks</p>
                            </div>

                            <div className="text-center">
                                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mx-auto mb-3">
                                    <Users className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                                </div>
                                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Cross-Analysis</h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400">Correlate multiple data sources for comprehensive insights</p>
                            </div>
                        </div>

                        <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
                            <p className="text-sm text-purple-800 dark:text-purple-200 font-medium">
                                💡 <strong>Next Steps:</strong> Upload engagement survey data in the Data Management section to unlock advanced correlation analysis capabilities.
                            </p>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
};

export default DeepAnalysisTab;