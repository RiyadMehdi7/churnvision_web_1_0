/**
 * Database Sync Flow Component
 * Visual representation of the DB sync and snapshot workflow
 */
import React from 'react';
import { motion } from 'framer-motion';
import {
  Database,
  RefreshCw,
  Camera,
  BarChart3,
  TrendingUp,
  Clock,
  CheckCircle,
  ArrowRight,
  Calendar,
  History
} from 'lucide-react';
import { cn } from '../lib/utils';

interface Snapshot {
  id: string;
  date: string;
  employeeCount: number;
  predictionsRun: boolean;
}

interface DatabaseSyncFlowProps {
  isConnected: boolean;
  lastSyncTime?: string;
  nextSyncTime?: string;
  snapshots?: Snapshot[];
  onSync?: () => void;
  className?: string;
}

export function DatabaseSyncFlow({
  isConnected,
  lastSyncTime,
  nextSyncTime,
  snapshots = [],
  onSync,
  className
}: DatabaseSyncFlowProps) {

  const flowSteps = [
    {
      icon: Database,
      title: 'HR Database',
      description: 'Connect to your HRIS',
      color: 'indigo',
      status: isConnected ? 'complete' : 'pending'
    },
    {
      icon: RefreshCw,
      title: 'Sync Data',
      description: 'Pull latest employee data',
      color: 'blue',
      status: isConnected ? 'active' : 'pending'
    },
    {
      icon: Camera,
      title: 'Create Snapshot',
      description: 'Save point-in-time copy',
      color: 'purple',
      status: snapshots.length > 0 ? 'complete' : 'pending'
    },
    {
      icon: BarChart3,
      title: 'Run Predictions',
      description: 'Generate risk scores',
      color: 'amber',
      status: snapshots.some(s => s.predictionsRun) ? 'complete' : 'pending'
    },
    {
      icon: TrendingUp,
      title: 'Track Outcomes',
      description: 'Compare predictions vs reality',
      color: 'emerald',
      status: snapshots.length >= 2 ? 'active' : 'pending'
    }
  ];

  const getStatusStyles = (status: string, color: string) => {
    const colors: Record<string, Record<string, string>> = {
      indigo: {
        complete: 'bg-indigo-100 dark:bg-indigo-900/40 border-indigo-300 dark:border-indigo-700',
        active: 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800 ring-2 ring-indigo-400',
        pending: 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
      },
      blue: {
        complete: 'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700',
        active: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 ring-2 ring-blue-400',
        pending: 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
      },
      purple: {
        complete: 'bg-purple-100 dark:bg-purple-900/40 border-purple-300 dark:border-purple-700',
        active: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800 ring-2 ring-purple-400',
        pending: 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
      },
      amber: {
        complete: 'bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700',
        active: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 ring-2 ring-amber-400',
        pending: 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
      },
      emerald: {
        complete: 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-300 dark:border-emerald-700',
        active: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 ring-2 ring-emerald-400',
        pending: 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
      }
    };
    return colors[color]?.[status] || colors.indigo.pending;
  };

  const getIconColor = (status: string, color: string) => {
    if (status === 'pending') return 'text-gray-400 dark:text-gray-500';
    const colorMap: Record<string, string> = {
      indigo: 'text-indigo-600 dark:text-indigo-400',
      blue: 'text-blue-600 dark:text-blue-400',
      purple: 'text-purple-600 dark:text-purple-400',
      amber: 'text-amber-600 dark:text-amber-400',
      emerald: 'text-emerald-600 dark:text-emerald-400'
    };
    return colorMap[color] || 'text-gray-600';
  };

  return (
    <div className={cn("space-y-6", className)}>
      {/* Flow Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Data Sync & Snapshot Flow
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            How ChurnVision tracks predictions over time
          </p>
        </div>
        {isConnected && onSync && (
          <button
            onClick={onSync}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Sync Now
          </button>
        )}
      </div>

      {/* Flow Diagram */}
      <div className="relative bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 overflow-hidden">
        {/* Flow Steps */}
        <div className="flex items-center justify-between gap-2">
          {flowSteps.map((step, index) => (
            <React.Fragment key={step.title}>
              {/* Step Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className={cn(
                  "flex-1 p-4 rounded-lg border-2 transition-all",
                  getStatusStyles(step.status, step.color)
                )}
              >
                <div className="flex flex-col items-center text-center">
                  <div className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center mb-2",
                    step.status === 'complete' && 'bg-white dark:bg-gray-900'
                  )}>
                    {step.status === 'complete' ? (
                      <CheckCircle className={cn("w-6 h-6", getIconColor(step.status, step.color))} />
                    ) : (
                      <step.icon className={cn("w-6 h-6", getIconColor(step.status, step.color))} />
                    )}
                  </div>
                  <h4 className={cn(
                    "font-medium text-sm",
                    step.status === 'pending' ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'
                  )}>
                    {step.title}
                  </h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {step.description}
                  </p>
                </div>
              </motion.div>

              {/* Arrow between steps */}
              {index < flowSteps.length - 1 && (
                <ArrowRight className="w-5 h-5 text-gray-300 dark:text-gray-600 flex-shrink-0" />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Timeline */}
        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Snapshot Timeline
            </span>
          </div>

          {snapshots.length > 0 ? (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute top-4 left-0 right-0 h-0.5 bg-gray-200 dark:bg-gray-700" />

              {/* Snapshot points */}
              <div className="relative flex justify-between">
                {snapshots.slice(-6).map((snapshot, index) => (
                  <div key={snapshot.id} className="flex flex-col items-center">
                    <div className={cn(
                      "w-8 h-8 rounded-full border-2 flex items-center justify-center bg-white dark:bg-gray-800 z-10",
                      snapshot.predictionsRun
                        ? 'border-emerald-500 text-emerald-500'
                        : 'border-blue-500 text-blue-500'
                    )}>
                      {snapshot.predictionsRun ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <Camera className="w-4 h-4" />
                      )}
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      {new Date(snapshot.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {snapshot.employeeCount} emp
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-8 text-gray-400 dark:text-gray-500">
              <div className="text-center">
                <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No snapshots yet</p>
                <p className="text-xs">Sync your database to create the first snapshot</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 rounded-lg px-4 py-3 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-2 h-2 rounded-full",
              isConnected ? 'bg-emerald-500' : 'bg-gray-400'
            )} />
            <span className="text-gray-600 dark:text-gray-400">
              {isConnected ? 'Connected' : 'Not Connected'}
            </span>
          </div>

          {lastSyncTime && (
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
              <Clock className="w-4 h-4" />
              <span>Last sync: {lastSyncTime}</span>
            </div>
          )}

          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
            <Camera className="w-4 h-4" />
            <span>Snapshots: {snapshots.length}</span>
          </div>
        </div>

        {nextSyncTime && (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Next sync: {nextSyncTime}
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
          How Snapshots Enable Prediction Tracking
        </h4>
        <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
          <li>1. Each sync creates a timestamped snapshot of your employee data</li>
          <li>2. Predictions are generated and stored with each snapshot</li>
          <li>3. When employees leave, we compare against historical predictions</li>
          <li>4. This enables backtesting and accuracy measurement over time</li>
        </ul>
      </div>
    </div>
  );
}

export default DatabaseSyncFlow;
