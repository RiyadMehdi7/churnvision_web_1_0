import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Brain, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { Employee } from '../types/employee';
import { getCurrentThresholds, getRiskLevel, getRiskLevelWithStyles } from '../config/riskThresholds';
import { getRiskColor } from '../lib/utils';

interface EnhancedEmployeeCardProps {
  employee: Employee;
  onReasoningClick: (employee: Employee) => void;
  index: number;
}

export const EnhancedEmployeeCard: React.FC<EnhancedEmployeeCardProps> = ({
  employee,
  onReasoningClick
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const thresholds = getCurrentThresholds();
  
  const getRiskLevelForEmployee = (probability: number) => {
    return getRiskLevel(probability, thresholds);
  };
  
  const getRiskLevelWithStylesForEmployee = (probability: number) => {
    return getRiskLevelWithStyles(probability, thresholds);
  };
  
  // Simplified hover handling for better performance
  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);
  
  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
  }, []);
  
  const probability = isNaN(employee.churnProbability) ? 0 : employee.churnProbability;
  const riskInfo = getRiskLevelWithStylesForEmployee(probability);
  const riskLevel = getRiskLevelForEmployee(probability);
  
  // Animated risk indicator
  const riskColor = getRiskColor(riskLevel as 'High' | 'Medium' | 'Low');
  
  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="relative bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 cursor-pointer overflow-hidden transform"
      onClick={() => onReasoningClick(employee)}
    >
      {/* Simplified background overlay */}
      <div 
        className={`absolute inset-0 transition-opacity duration-200 ${isHovered ? 'opacity-10' : 'opacity-0'}`}
        style={{ backgroundColor: riskColor }}
      />
      
      {/* Risk indicator */}
      <div className="absolute top-4 right-4">
        <div className={`px-3 py-1 rounded-full text-xs font-semibold ${riskInfo.color} ${riskInfo.bgColor}`}>
          {riskLevel}
        </div>
      </div>
      
      {/* Employee info with staggered animation */}
      <motion.div
        animate={{ x: isHovered ? 10 : 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
      >
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          {employee.full_name}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
          {employee.structure_name}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-500">
          {employee.position}
        </p>
      </motion.div>
      
      {/* Animated churn probability */}
      <motion.div 
        className="mt-4 flex items-center justify-between"
        animate={{ x: isHovered ? 10 : 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 25, delay: 0.05 }}
      >
        <div className="flex items-center space-x-2">
          <motion.div
            animate={{ rotate: isHovered ? 360 : 0 }}
            transition={{ duration: 0.6, ease: "easeInOut" }}
          >
            {riskLevel === 'High' ? (
              <TrendingUp className="w-5 h-5 text-red-500" />
            ) : riskLevel === 'Medium' ? (
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
            ) : (
              <TrendingDown className="w-5 h-5 text-green-500" />
            )}
          </motion.div>
          <span className="text-lg font-bold text-gray-900 dark:text-white">
            {(probability * 100).toFixed(1)}%
          </span>
        </div>
        
        {/* Animated reasoning button */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={(e) => {
            e.stopPropagation();
            onReasoningClick(employee);
          }}
          className="flex items-center space-x-1 px-3 py-1 bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/30 dark:hover:bg-purple-800/50 text-purple-700 dark:text-purple-300 rounded-lg transition-colors text-sm"
        >
          <Brain className="w-4 h-4" />
          <span>Analyze</span>
        </motion.button>
      </motion.div>
      
      {/* Confidence indicator with animated progress */}
      <motion.div 
        className="mt-3"
        animate={{ x: isHovered ? 10 : 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 25, delay: 0.1 }}
      >
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
          <span>Confidence</span>
          <span>{Math.round((employee.reasoningConfidence || employee.confidenceScore || 0) * 100)}%</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
          <div
            className="h-1.5 rounded-full bg-gradient-to-r from-blue-400 to-purple-500 transition-all duration-300"
            style={{ width: `${(employee.reasoningConfidence || employee.confidenceScore || 0) * 100}%` }}
          />
        </div>
      </motion.div>
    </div>
  );
};