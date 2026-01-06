import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { 
  Brain, 
  Home, 
  PlayCircle, 
  Database, 
  Settings,
  Bell,
  Search,
  Menu,
  X,
  TrendingUp,
  AlertTriangle,
  Users,
  Zap
} from 'lucide-react';
import { useGlobalDataCache } from '@/hooks/useGlobalDataCache';
import { getCurrentThresholds, getRiskLevel } from '@/config/riskThresholds';

interface SmartHeaderProps {
  onMenuToggle?: () => void;
  isMenuOpen?: boolean;
}

const pageConfigs = {
  '/': {
    title: 'Dashboard',
    subtitle: 'Employee churn risk overview',
    icon: Home,
    gradient: 'from-blue-500 to-cyan-500',
    bgPattern: 'dashboard'
  },
  '/ai-assistant': {
    title: 'AI Assistant',
    subtitle: 'Intelligent workforce insights',
    icon: Brain,
    gradient: 'from-purple-500 to-pink-500',
    bgPattern: 'ai'
  },
  '/playground': {
    title: 'Playground',
    subtitle: 'Experiment with data models',
    icon: PlayCircle,
    gradient: 'from-green-500 to-emerald-500',
    bgPattern: 'playground'
  },
  '/data-management': {
    title: 'Data Management',
    subtitle: 'Import and manage employee data',
    icon: Database,
    gradient: 'from-orange-500 to-red-500',
    bgPattern: 'data'
  },
  '/settings': {
    title: 'Settings',
    subtitle: 'Configure your preferences',
    icon: Settings,
    gradient: 'from-gray-500 to-gray-700',
    bgPattern: 'settings'
  }
};

export const SmartHeader: React.FC<SmartHeaderProps> = ({ 
  onMenuToggle, 
  isMenuOpen = false 
}) => {
  const location = useLocation();
  const { homeEmployees } = useGlobalDataCache();
  const thresholds = getCurrentThresholds();
  
  const getRiskLevelForEmployee = (probability: number) => {
    return getRiskLevel(probability, thresholds);
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [aiInsights, setAiInsights] = useState<any>(null);

  // Get current page config
  const currentConfig = pageConfigs[location.pathname as keyof typeof pageConfigs] || pageConfigs['/'];
  const Icon = currentConfig.icon;

  // Calculate AI insights
  useEffect(() => {
    if (homeEmployees && homeEmployees.length > 0) {
      const highRisk = homeEmployees.filter(emp => getRiskLevelForEmployee(emp.churnProbability || 0) === 'High').length;
      const mediumRisk = homeEmployees.filter(emp => getRiskLevelForEmployee(emp.churnProbability || 0) === 'Medium').length;
      const avgRisk = homeEmployees.reduce((sum, emp) => sum + (emp.churnProbability || 0), 0) / homeEmployees.length;
      
      setAiInsights({
        totalEmployees: homeEmployees.length,
        highRisk,
        mediumRisk,
        avgRisk: avgRisk * 100,
        urgencyLevel: highRisk > 10 ? 'critical' : highRisk > 5 ? 'high' : 'medium'
      });
    }
  }, [homeEmployees, getRiskLevel]);

  const getBackgroundPattern = () => {
    switch (currentConfig.bgPattern) {
      case 'ai':
        return (
          <div className="absolute inset-0 opacity-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(168,85,247,0.4),transparent_50%)]" />
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="absolute top-4 right-4 w-32 h-32 border border-purple-300 rounded-full"
            />
          </div>
        );
      case 'dashboard':
        return (
          <div className="absolute inset-0 opacity-10">
            <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(59,130,246,0.1)_25%,rgba(59,130,246,0.1)_50%,transparent_50%,transparent_75%,rgba(59,130,246,0.1)_75%)] bg-[length:20px_20px]" />
          </div>
        );
      default:
        return (
          <div className="absolute inset-0 opacity-5">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_40%,rgba(255,255,255,0.1),transparent_50%)]" />
          </div>
        );
    }
  };

  const handleSearch = (query: string) => {
    // Implement search functionality
    console.log('Searching for:', query);
  };

  return (
    <motion.header
      layout
      className={`relative overflow-hidden bg-gradient-to-r ${currentConfig.gradient} text-white shadow-2xl`}
      initial={{ height: 120 }}
      animate={{ 
        height: location.pathname === '/' ? 160 : 120,
      }}
      transition={{ duration: 0.5, ease: "easeInOut" }}
    >
      {/* Background Pattern */}
      {getBackgroundPattern()}
      
      {/* Main Header Content */}
      <div className="relative z-10 px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Left Section */}
          <div className="flex items-center space-x-4">
            {/* Menu Toggle */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={onMenuToggle}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            >
              <AnimatePresence mode="wait">
                {isMenuOpen ? (
                  <motion.div
                    key="close"
                    initial={{ rotate: -90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: 90, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <X size={20} />
                  </motion.div>
                ) : (
                  <motion.div
                    key="menu"
                    initial={{ rotate: 90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: -90, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Menu size={20} />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>

            {/* Page Icon & Title */}
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              className="flex items-center space-x-3"
            >
              <motion.div
                animate={{ 
                  rotate: currentConfig.bgPattern === 'ai' ? [0, 360] : 0,
                  scale: [1, 1.1, 1]
                }}
                transition={{ 
                  rotate: { duration: 3, repeat: Infinity, ease: "linear" },
                  scale: { duration: 2, repeat: Infinity }
                }}
                className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center"
              >
                <Icon size={24} />
              </motion.div>
              <div>
                <h1 className="text-2xl font-bold">{currentConfig.title}</h1>
                <p className="text-sm opacity-90">{currentConfig.subtitle}</p>
              </div>
            </motion.div>
          </div>

          {/* Right Section */}
          <div className="flex items-center space-x-4">
            {/* Search */}
            <div className="relative">
              <AnimatePresence>
                {showSearch ? (
                  <motion.div
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 300, opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    className="flex items-center bg-white/20 backdrop-blur-sm rounded-lg overflow-hidden"
                  >
                    <input
                      type="text"
                      placeholder="Search employees..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSearch(searchQuery)}
                      className="flex-1 px-4 py-2 bg-transparent text-white placeholder-white/70 outline-none"
                      autoFocus
                    />
                    <button
                      onClick={() => setShowSearch(false)}
                      className="p-2 hover:bg-white/10 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </motion.div>
                ) : (
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setShowSearch(true)}
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                  >
                    <Search size={20} />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            {/* Notifications */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="relative p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            >
              <Bell size={20} />
              {aiInsights?.urgencyLevel === 'critical' && (
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"
                />
              )}
            </motion.button>
          </div>
        </div>

        {/* AI Insights Bar (Dashboard only) */}
        <AnimatePresence>
          {location.pathname === '/' && aiInsights && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ delay: 0.3 }}
              className="mt-6 flex items-center justify-between bg-white/10 backdrop-blur-sm rounded-xl p-4"
            >
              <div className="flex items-center space-x-6">
                <div className="flex items-center space-x-2">
                  <Users size={16} />
                  <span className="text-sm">
                    <span className="font-semibold">{aiInsights.totalEmployees}</span> employees
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <AlertTriangle size={16} className="text-red-300" />
                  <span className="text-sm">
                    <span className="font-semibold">{aiInsights.highRisk}</span> high risk
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <TrendingUp size={16} className="text-yellow-300" />
                  <span className="text-sm">
                    <span className="font-semibold">{aiInsights.avgRisk.toFixed(1)}%</span> avg risk
                  </span>
                </div>
              </div>

              {/* AI Status Indicator */}
              <motion.div
                animate={{ 
                  scale: [1, 1.05, 1],
                  opacity: [0.8, 1, 0.8]
                }}
                transition={{ duration: 2, repeat: Infinity }}
                className="flex items-center space-x-2 bg-white/20 rounded-lg px-3 py-1"
              >
                <Zap size={14} className="text-yellow-300" />
                <span className="text-xs font-medium">AI Active</span>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Animated Border */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-white/50 to-transparent"
        animate={{ 
          backgroundPosition: ['0% 50%', '100% 50%', '0% 50%']
        }}
        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
      />
    </motion.header>
  );
};