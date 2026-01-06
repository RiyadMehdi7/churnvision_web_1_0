/**
 * Alert Notification Bell Component
 * Displays risk alerts in a dropdown from the navbar
 */
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  BellRing,
  AlertTriangle,
  TrendingUp,
  UserPlus,
  XCircle,
  CheckCircle,
  ChevronRight,
  Loader2,
  Check
} from 'lucide-react';
import { cn } from '../lib/utils';
import { modelIntelligenceService, RiskAlert, AlertsResult } from '../services/modelIntelligenceService';
import { useNavigate } from 'react-router-dom';

interface AlertNotificationBellProps {
  className?: string;
}

const SEVERITY_CONFIG = {
  critical: {
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    textColor: 'text-red-700 dark:text-red-400',
    borderColor: 'border-red-200 dark:border-red-800',
    icon: AlertTriangle,
    badgeColor: 'bg-red-500'
  },
  high: {
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    textColor: 'text-orange-700 dark:text-orange-400',
    borderColor: 'border-orange-200 dark:border-orange-800',
    icon: TrendingUp,
    badgeColor: 'bg-orange-500'
  },
  medium: {
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    textColor: 'text-amber-700 dark:text-amber-400',
    borderColor: 'border-amber-200 dark:border-amber-800',
    icon: TrendingUp,
    badgeColor: 'bg-amber-500'
  },
  low: {
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    textColor: 'text-blue-700 dark:text-blue-400',
    borderColor: 'border-blue-200 dark:border-blue-800',
    icon: UserPlus,
    badgeColor: 'bg-blue-500'
  }
};

export function AlertNotificationBell({ className }: AlertNotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [alertsData, setAlertsData] = useState<AlertsResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch alerts when dropdown opens
  useEffect(() => {
    if (isOpen) {
      fetchAlerts();
    }
  }, [isOpen]);

  // Poll for alerts periodically (every 60 seconds)
  useEffect(() => {
    const fetchInitial = async () => {
      try {
        const data = await modelIntelligenceService.getAlerts(5, false);
        setAlertsData(data);
      } catch (err) {
        // Silently fail on initial load
      }
    };

    fetchInitial();

    const interval = setInterval(async () => {
      try {
        const data = await modelIntelligenceService.getAlerts(5, false);
        setAlertsData(data);
      } catch (err) {
        // Silently fail on periodic poll
      }
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const fetchAlerts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await modelIntelligenceService.getAlerts(10, false);
      setAlertsData(data);
    } catch (err: any) {
      console.error('Error fetching alerts:', err);
      setError(err.message || 'Failed to load alerts');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkAsRead = async (alertId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await modelIntelligenceService.markAlertRead(alertId);
      // Update local state
      if (alertsData) {
        setAlertsData({
          ...alertsData,
          alerts: alertsData.alerts.map(a =>
            a.id === alertId ? { ...a, is_read: true } : a
          ),
          unread_count: Math.max(0, alertsData.unread_count - 1)
        });
      }
    } catch (err) {
      console.error('Error marking alert as read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await modelIntelligenceService.markAllAlertsRead();
      if (alertsData) {
        setAlertsData({
          ...alertsData,
          alerts: alertsData.alerts.map(a => ({ ...a, is_read: true })),
          unread_count: 0
        });
      }
    } catch (err) {
      console.error('Error marking all alerts as read:', err);
    }
  };

  const handleAlertClick = (alert: RiskAlert) => {
    navigate(`/reasoning/${alert.hr_code}`);
    setIsOpen(false);
  };

  const unreadCount = alertsData?.unread_count || 0;
  const hasAlerts = alertsData && alertsData.alerts.length > 0;

  return (
    <div className={cn("relative", className)} ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "relative p-2 rounded-lg transition-colors",
          "hover:bg-gray-100 dark:hover:bg-gray-800",
          "focus:outline-none focus:ring-2 focus:ring-blue-500",
          isOpen && "bg-gray-100 dark:bg-gray-800"
        )}
        aria-label="Notifications"
      >
        {unreadCount > 0 ? (
          <motion.div
            animate={{ rotate: [0, -10, 10, -10, 10, 0] }}
            transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 5 }}
          >
            <BellRing className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </motion.div>
        ) : (
          <Bell className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        )}

        {/* Badge */}
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className={cn(
              "absolute -top-0.5 -right-0.5 flex items-center justify-center",
              "min-w-[18px] h-[18px] px-1 rounded-full text-xs font-bold text-white",
              alertsData?.severity_counts.critical && alertsData.severity_counts.critical > 0
                ? "bg-red-500"
                : alertsData?.severity_counts.high && alertsData.severity_counts.high > 0
                ? "bg-orange-500"
                : "bg-blue-500"
            )}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </motion.span>
        )}
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className={cn(
              "absolute right-0 mt-2 w-96 max-h-[500px] overflow-hidden",
              "bg-white dark:bg-gray-800 rounded-lg shadow-lg",
              "border border-gray-200 dark:border-gray-700",
              "z-50"
            )}
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">Risk Alerts</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {unreadCount > 0 ? `${unreadCount} unread alerts` : 'All caught up!'}
                </p>
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* Content */}
            <div className="max-h-[400px] overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                </div>
              ) : error ? (
                <div className="text-center py-8 px-4">
                  <XCircle className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">{error}</p>
                </div>
              ) : !hasAlerts ? (
                <div className="text-center py-8 px-4">
                  <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">No alerts</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    All employees are within expected risk levels
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {alertsData!.alerts.map((alert) => {
                    const config = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.low;
                    const Icon = config.icon;

                    return (
                      <motion.div
                        key={alert.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className={cn(
                          "px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors",
                          !alert.is_read && "bg-blue-50/50 dark:bg-blue-900/10"
                        )}
                        onClick={() => handleAlertClick(alert)}
                      >
                        <div className="flex gap-3">
                          <div className={cn(
                            "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
                            config.bgColor
                          )}>
                            <Icon className={cn("w-4 h-4", config.textColor)} />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className={cn(
                                "text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2",
                                !alert.is_read && "font-semibold"
                              )}>
                                {alert.message}
                              </p>
                              {!alert.is_read && (
                                <button
                                  onClick={(e) => handleMarkAsRead(alert.id, e)}
                                  className="flex-shrink-0 p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                                  title="Mark as read"
                                >
                                  <Check className="w-3 h-3 text-gray-400" />
                                </button>
                              )}
                            </div>

                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">
                              {alert.context}
                            </p>

                            <div className="flex items-center gap-2 mt-2">
                              <span className={cn(
                                "px-2 py-0.5 text-xs font-medium rounded-full",
                                config.bgColor, config.textColor
                              )}>
                                {alert.severity}
                              </span>
                              <span className="text-xs text-gray-400 dark:text-gray-500">
                                {alert.department}
                              </span>
                              <ChevronRight className="w-3 h-3 text-gray-400 ml-auto" />
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            {hasAlerts && (
              <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                <button
                  onClick={() => {
                    setIsOpen(false);
                    // Could navigate to a full alerts page if one exists
                  }}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline w-full text-center"
                >
                  View all alerts
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default AlertNotificationBell;
