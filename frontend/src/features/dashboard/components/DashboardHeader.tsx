import React, { memo } from 'react';
import { motion } from 'framer-motion';

export const DashboardHeader = memo(() => (
    <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 -mx-6 -mt-6 px-8 py-8 border-b border-gray-700/50 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-500/50 to-transparent"></div>
        </div>

        <div className="relative">
            <div className="flex justify-between items-center">
                <div>
                    <div className="flex items-center gap-3 mb-3">
                        <motion.h1
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-200 via-blue-400 to-blue-200 animate-gradient"
                        >
                            ChurnVision - Employee Churn Risk Dashboard
                        </motion.h1>
                        <div className="flex items-center gap-2">
                            {/* Pulse Badge */}
                            <motion.span
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 0.2 }}
                                className="relative group"
                            >
                                <span className="px-2.5 py-1 text-xs font-semibold bg-sky-500/10 text-sky-300 rounded-md border border-sky-500/30 relative z-10 flex items-center gap-1.5 shadow-sm group-hover:bg-sky-500/20 transition-all duration-200">
                                    <span className="h-2 w-2 rounded-full bg-sky-400 block animate-pulse group-hover:animate-none"></span>
                                    Pulse
                                </span>
                                <div className="absolute inset-0 bg-sky-500/20 rounded-md blur-sm opacity-70 group-hover:opacity-100 transition-opacity duration-200"></div>
                            </motion.span>

                            <motion.span
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 0.3 }}
                                className="relative group"
                            >
                                <span className="px-2.5 py-1 text-xs font-medium bg-emerald-500/10 text-emerald-300 rounded-md border border-emerald-500/30 relative z-10 flex items-center gap-1.5 shadow-sm group-hover:bg-emerald-500/20 transition-all duration-200">
                                    <span className="h-2 w-2 rounded-full bg-emerald-400 block animate-pulse group-hover:animate-none"></span>
                                    ML-Based
                                </span>
                                <div className="absolute inset-0 bg-emerald-500/20 rounded-md blur-sm opacity-70 group-hover:opacity-100 transition-opacity duration-200"></div>
                            </motion.span>
                        </div>
                    </div>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="text-base text-gray-400 max-w-2xl"
                    >
                        Step into the future of talent retention. Our AI-driven platform empowers you to monitor and analyze employee churn risk factors with unprecedented precision.
                    </motion.p>
                </div>
            </div>
        </div>
    </div>
));
