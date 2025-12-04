import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOnboarding } from '../hooks/useOnboarding';
import { useLicense, getLicenseTierDisplayName, type LicenseTier } from '../providers/LicenseProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { 
    AlertTriangle, 
    Info, 
    RefreshCw, 
    Trash2, 
    KeyRound, 
    CalendarDays, 
    BarChartBig, 
    ShieldCheck, 
    Hourglass, 
    Settings as SettingsIcon, 
    Database, 
    Crown,
    Palette,
    FolderOpen,
    HelpCircle,
    Monitor,
    User,
    Bell,
    Lock,
    Globe,
    Bot,
    CheckCircle,
    Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import api from '@/services/api';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { uiLogger } from '@/utils/logger';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import churnVisionIcon from '@/assets/providers/churnvision.svg';
import microsoftIcon from '@/assets/providers/microsoft.svg';
import qwenIcon from '@/assets/providers/qwen.svg';
import openaiIcon from '@/assets/providers/openai.svg';
import mistralIcon from '@/assets/providers/mistral.svg';
import ibmIcon from '@/assets/providers/ibm.svg';
import { Progress } from '@/components/ui/progress';

// Settings section types
type SettingsSection = 'general' | 'license' | 'appearance' | 'ai' | 'data' | 'security' | 'advanced';

interface SettingsSectionData {
  id: SettingsSection;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
}

// Helper component for settings rows
const SettingsRow = ({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon?: React.ElementType }) => (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-700/50 last:border-b-0">
        <div className="flex items-center gap-3">
            {Icon && <Icon className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />}
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">{label}</span>
        </div>
        <div className="text-sm text-gray-800 dark:text-gray-100 text-right">{value}</div>
    </div>
);

// Settings section navigation component
const SettingsNavigation = ({ 
  sections, 
  activeSection, 
  onSectionChange 
}: { 
  sections: SettingsSectionData[]; 
  activeSection: SettingsSection; 
  onSectionChange: (section: SettingsSection) => void; 
}) => (
  <div className="space-y-2">
    {sections.map((section) => (
      <motion.button
        key={section.id}
        onClick={() => onSectionChange(section.id)}
        className={cn(
          "w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all duration-200",
          activeSection === section.id
            ? "bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
            : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/50 hover:text-gray-800 dark:hover:text-gray-200"
        )}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <section.icon className={cn("w-5 h-5", section.color)} />
        <div>
          <div className="font-medium text-sm">{section.title}</div>
          <div className="text-xs opacity-70">{section.description}</div>
        </div>
      </motion.button>
    ))}
  </div>
);

export function Settings() {
  const navigate = useNavigate();
  const { resetOnboarding } = useOnboarding();
  const { licenseStatus, licenseData, isLoading: isLicenseLoading, error: licenseError, gracePeriodEnds, licenseTier } = useLicense();
  const [activeSection, setActiveSection] = useState<SettingsSection>('general');
  const [isResetAlertOpen, setIsResetAlertOpen] = useState(false);
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [projectsBaseDir, setProjectsBaseDir] = useState('');
  const [isSavingBaseDir, setIsSavingBaseDir] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const { toast } = useToast();
  
  // Data mode settings
  const [dataMode, setDataMode] = useState<'wage' | 'performance'>(() => {
    const v = localStorage.getItem('settings.dataMode');
    return v === 'performance' ? 'performance' : 'wage';
  });

  // Settings sections configuration
  const settingsSections: SettingsSectionData[] = useMemo(() => [
    {
      id: 'general',
      title: 'General',
      description: 'Basic app settings',
      icon: SettingsIcon,
      color: 'text-gray-600'
    },
    {
      id: 'license',
      title: 'License & Plans',
      description: 'Manage your subscription',
      icon: Crown,
      color: 'text-purple-600'
    },
    {
      id: 'appearance',
      title: 'Appearance',
      description: 'Theme and display',
      icon: Palette,
      color: 'text-blue-600'
    },
    {
      id: 'ai',
      title: 'AI & Models',
      description: 'Choose AI provider',
      icon: Bot,
      color: 'text-emerald-600'
    },
    {
      id: 'data',
      title: 'Data & Storage',
      description: 'Data sources and paths',
      icon: Database,
      color: 'text-green-600'
    },
    {
      id: 'security',
      title: 'Security',
      description: 'Privacy and security',
      icon: Lock,
      color: 'text-red-600'
    },
    {
      id: 'advanced',
      title: 'Advanced',
      description: 'Developer options',
      icon: Monitor,
      color: 'text-orange-600'
    }
  ], []);

  const [provider, setProvider] = useState<AIProviderType>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('churnvision-ai-model-type');
      if (stored && isValidAIProvider(stored)) {
        return stored;
      }
    }
    return 'local';
  });
  const [providerStatus, setProviderStatus] = useState<Record<string, ProviderInstallationStatus>>({});
  const [pendingProvision, setPendingProvision] = useState<Record<string, boolean>>({});
  const [loadingProvider, setLoadingProvider] = useState<boolean>(true);
  const [loadingOffline, setLoadingOffline] = useState<boolean>(true);
  const [savingProvider, setSavingProvider] = useState<boolean>(false);
  const [strictOffline, setStrictOffline] = useState<boolean>(false);
  const mountedRef = useRef(true);
  const strictOfflinePrevRef = useRef<boolean>(false);

  const getStoredLocalProvider = useCallback((): AIProviderType | null => {
    if (typeof window === 'undefined') {
      return null;
    }
    const stored = localStorage.getItem(LAST_LOCAL_PROVIDER_KEY);
    return isLocalProviderId(stored) ? stored : null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshProviderStatus = useCallback(async () => {
    try {
      const response = await api.get('/ai/provider-status');
      if (response.data?.status && mountedRef.current) {
        setProviderStatus(response.data.status as Record<string, ProviderInstallationStatus>);
      }
    } catch (error) {
      uiLogger.warn('[Settings] Failed to fetch provider status', error);
    }
  }, []);

  const loadProviderPreference = useCallback(async () => {
    try {
      const response = await api.get('/ai/model-type');
      const modelType = response.data?.modelType;
      if (isValidAIProvider(modelType) && mountedRef.current) {
        setProvider(modelType);
        if (isLocalProviderId(modelType) && typeof window !== 'undefined') {
          localStorage.setItem(LAST_LOCAL_PROVIDER_KEY, modelType);
        }
      }
    } catch (error) {
      uiLogger.warn('[Settings] Failed to load provider preference', error);
    } finally {
      if (mountedRef.current) {
        setLoadingProvider(false);
      }
    }
  }, []);

  const loadStrictOfflineState = useCallback(async () => {
    setLoadingOffline(true);
    try {
      const response = await api.get('/settings/offline-mode');
      if (mountedRef.current) {
        setStrictOffline(!!response.data?.enabled);
      }
    } catch (error) {
      uiLogger.warn('[Settings] Failed to load strict offline mode', error);
    } finally {
      if (mountedRef.current) {
        setLoadingOffline(false);
      }
    }
  }, []);

  useEffect(() => {
    loadProviderPreference();
    loadStrictOfflineState();
    refreshProviderStatus();
  }, [loadProviderPreference, loadStrictOfflineState, refreshProviderStatus]);

  // Removed Electron IPC listener - web application uses REST API polling for provider status
  // If real-time updates are needed, implement WebSocket or periodic polling via useEffect

  const providerOptions = useMemo<ProviderOption[]>(() => {
    return manifestProviders.map(entry => {
      const icon = iconLookup[entry.id] ?? 'churnvision';
      const accent = accentLookup[entry.id] ?? 'bg-emerald-500';
      const status = providerStatus[entry.id];
      const isProvisioning = !!pendingProvision[entry.id] || status?.status === 'downloading' || status?.status === 'verifying';
      const isInstalled = Boolean(status?.path) || ['ready', 'completed'].includes(status?.status ?? '');
      const requiresOnline = entry.requiresOnline ?? (entry.deployment === 'cloud' || (!!entry.artifact && !isInstalled));

      return {
        id: entry.id,
        value: (entry.id as AIProviderType),
        label: entry.label,
        description: entry.description,
        badge: entry.badge,
        icon,
        deployment: entry.deployment,
        accent,
        metrics: entry.metrics,
        artifact: entry.artifact,
        requiresOnline,
        requiresApiKey: entry.requiresApiKey,
        disabled: entry.id === 'auto',
        status,
        isProvisioning,
      } satisfies ProviderOption;
    });
  }, [pendingProvision, providerStatus]);

  const providerLabels = useMemo(() => {
    return providerOptions.reduce((acc, option) => {
      acc[option.value] = option.label;
      return acc;
    }, {} as Record<AIProviderType, string>);
  }, [providerOptions]);

  const activeProviderOption = useMemo(() => {
    return providerOptions.find(option => option.value === provider) ?? providerOptions[0];
  }, [providerOptions, provider]);

  const provisioningInFlight = useMemo(() => Object.values(pendingProvision).some(Boolean), [pendingProvision]);

  const ensureProviderProvisioned = useCallback(async (option: ProviderOption) => {
    if (option.deployment !== 'local' || !option.artifact) {
      return false;
    }

    const current = providerStatus[option.id];
    if ((current?.status === 'ready' || current?.status === 'completed' || current?.path) && !current?.error) {
      return false;
    }

    setPendingProvision(prev => ({ ...prev, [option.id]: true }));

    try {
      const response = await api.post('/ai/provision-provider', { provider_id: option.id });
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Provisioning failed');
      }
      await refreshProviderStatus();
      return true;
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || error.message || 'Provisioning failed');
    } finally {
      if (mountedRef.current) {
        setPendingProvision(prev => ({ ...prev, [option.id]: false }));
      }
    }
  }, [providerStatus, refreshProviderStatus]);

  const handleProviderSelect = useCallback(
    async (option: ProviderOption, optionDisabled: boolean) => {
      if (optionDisabled) {
        if (strictOffline) {
          toast({
            title: 'Offline mode enabled',
            description: 'Disable strict offline mode in Security settings to change AI providers.',
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Provider not yet available',
            description: 'This provider will be enabled in a future release.',
          });
        }
        return;
      }

      const nextProvider = option.value;
      if (!isValidAIProvider(nextProvider)) {
        toast({
          title: 'Provider coming soon',
          description: 'Support for this provider is not yet available in this build.',
        });
        return;
      }

      if (nextProvider === provider) {
        return;
      }

      setSavingProvider(true);
      try {
        // Update provider via backend API
        await api.post('/ai/set-provider', { provider: nextProvider });

        // Update local storage
        if (typeof window !== 'undefined') {
          localStorage.setItem('churnvision-ai-model-type', nextProvider);
          if (option.deployment === 'local') {
            localStorage.setItem(LAST_LOCAL_PROVIDER_KEY, nextProvider);
          }
          window.dispatchEvent(
            new CustomEvent<AIProviderType>('churnvision:ai-provider-changed', {
              detail: nextProvider,
            })
          );
        }

        if (mountedRef.current) {
          setProvider(nextProvider);
        }

        toast({
          title: 'AI provider updated',
          description: providerLabels[nextProvider],
        });

        if (!strictOffline) {
          await ensureProviderProvisioned(option);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error occurred while switching provider.';
        toast({
          title: 'Unable to switch provider',
          description: message,
          variant: 'destructive',
        });
      } finally {
        if (mountedRef.current) {
          setSavingProvider(false);
        }
      }
    },
    [provider, providerLabels, strictOffline, toast, ensureProviderProvisioned]
  );

  const enforceLocalProvider = useCallback(async () => {
    const storedLocal = getStoredLocalProvider();
    const fallbackOption =
      (storedLocal && providerOptions.find(option => option.id === storedLocal && option.deployment === 'local')) ||
      providerOptions.find(option => option.deployment === 'local');

    if (!fallbackOption || fallbackOption.value === provider) {
      return;
    }

    await handleProviderSelect(fallbackOption, false);
  }, [getStoredLocalProvider, providerOptions, provider, handleProviderSelect]);

  useEffect(() => {
    const wasStrict = strictOfflinePrevRef.current;
    strictOfflinePrevRef.current = strictOffline;
    if (strictOffline && !wasStrict) {
      enforceLocalProvider().catch(error => uiLogger.warn('[Settings] Failed to enforce local provider', error));
    }
  }, [strictOffline, enforceLocalProvider]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handler = (event: Event) => {
      const enabled = !!(event as CustomEvent<boolean>).detail;
      if (mountedRef.current) {
        setStrictOffline(enabled);
        setLoadingOffline(false);
      }
      refreshProviderStatus();
      loadProviderPreference();
    };

    window.addEventListener('churnvision:strict-offline-changed', handler as EventListener);
    return () => {
      window.removeEventListener('churnvision:strict-offline-changed', handler as EventListener);
    };
  }, [refreshProviderStatus, loadProviderPreference]);

  const controlsDisabled = strictOffline || savingProvider || loadingProvider || provisioningInFlight;

  const aiSection = (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-emerald-600" />
              AI Provider & Models
            </CardTitle>
            <CardDescription>Control how ChurnVision’s AI assistant runs and which local model it prefers.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div
            className={cn(
              'rounded-lg border p-4 transition-colors',
              strictOffline ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800' : 'bg-surface-subtle border-border'
            )}
          >
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="font-medium flex items-center gap-2">
                  Strict Offline Mode
                  {loadingOffline && <span className="text-xs text-neutral-muted">(checking…)</span>}
                </div>
                <p className="text-sm text-neutral-muted">
                  {strictOffline
                    ? 'AI configuration is locked while strict offline mode is enabled.'
                    : 'Online capabilities are available. You can safely adjust AI provider preferences.'}
                </p>
              </div>
              <span
                className={cn(
                  'px-2 py-1 text-xs font-semibold rounded-md uppercase tracking-wide',
                  strictOffline
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200'
                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200'
                )}
              >
                {strictOffline ? 'Locked' : 'Unlocked'}
              </span>
            </div>
            {strictOffline && (
              <p className="mt-3 text-xs text-neutral-muted">
                Disable strict offline mode from the Security tab to make changes to providers or models.
              </p>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {providerOptions.map((option) => {
              const isSelected = isValidAIProvider(provider) && provider === option.value;
              const status = option.status;
              const downloadedBytes = status?.downloadedBytes ?? 0;
              const totalBytes = status?.totalBytes ?? option.artifact?.size ?? 0;
              const percent = status?.percent ?? (totalBytes ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : null);
              const isProvisioning = option.isProvisioning ?? false;
              const optionDisabled =
                controlsDisabled || !!option.disabled || (!!option.requiresOnline && strictOffline) || isProvisioning;
              const metricItems = [
                { key: 'speed', label: 'Speed', score: option.metrics.speed },
                { key: 'performance', label: 'Performance', score: option.metrics.performance },
                { key: 'intelligence', label: 'Intelligence', score: option.metrics.intelligence },
              ];

              let statusLabel = '';
              let statusTone = 'text-neutral-muted';

              if (option.deployment === 'cloud') {
                if (option.id === 'openai') {
                  statusLabel = 'Managed by ChurnVision';
                  statusTone = 'text-emerald-600';
                } else {
                  statusLabel = 'Cloud hosted';
                  statusTone = 'text-sky-600';
                }
              } else if (status?.status === 'downloading') {
                statusLabel = `Downloading ${percent ?? 0}%`;
                statusTone = 'text-blue-600';
              } else if (status?.status === 'verifying') {
                statusLabel = 'Verifying download';
                statusTone = 'text-blue-600';
              } else if (status?.status === 'error') {
                statusLabel = status?.error ? `Error: ${status.error}` : 'Provisioning failed';
                statusTone = 'text-red-600';
              } else if (status?.status === 'ready' || status?.status === 'completed' || status?.path) {
                statusLabel = 'Ready to use';
                statusTone = 'text-emerald-600';
              } else if (!option.artifact) {
                statusLabel = 'Ready to use';
                statusTone = 'text-emerald-600';
              } else if (option.disabled) {
                statusLabel = 'Coming soon';
              } else {
                statusLabel = 'Not installed';
              }

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleProviderSelect(option, optionDisabled)}
                  disabled={optionDisabled}
                  className={cn(
                    'relative flex h-full flex-col gap-4 rounded-lg border p-4 text-left transition-all',
                    isSelected
                      ? 'border-emerald-500 bg-surface-elevated shadow-lg shadow-emerald-500/10'
                      : 'border-border bg-surface hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-md',
                    optionDisabled && 'cursor-not-allowed opacity-60 hover:translate-y-0 hover:shadow-none'
                  )}
                >
                  <div className="flex items-start gap-3">
                    {renderProviderIcon(option.icon)}
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold leading-tight text-foreground">{option.label}</span>
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/80',
                            option.deployment === 'local'
                              ? 'bg-emerald-100/80 dark:bg-emerald-900/40'
                              : 'bg-indigo-100/80 dark:bg-indigo-900/40'
                          )}
                        >
                          {option.deployment === 'local' ? 'Runs locally' : 'Cloud hosted'}
                        </span>
                        {option.badge && (
                          <span className="rounded-full bg-emerald-100/80 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                            {option.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-neutral-muted leading-snug">{option.description}</p>
                      <div className="flex items-center gap-2 text-[11px] font-medium">
                        <span className={cn(statusTone)}>{statusLabel}</span>
                        {isProvisioning && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                      </div>
                      {status?.status === 'downloading' && (
                        <div className="mt-2 space-y-1">
                          <Progress value={percent ?? 0} className="h-1.5" />
                          <p className="text-[11px] text-neutral-muted">
                            {formatBytes(downloadedBytes)} / {totalBytes ? formatBytes(totalBytes) : 'unknown'}
                          </p>
                        </div>
                      )}
                      {status?.status === 'error' && status?.error && (
                        <p className="mt-2 text-xs text-red-600 dark:text-red-400 line-clamp-2">{status.error}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-2 text-xs uppercase tracking-wide text-neutral-muted">
                    {metricItems.map((metric) => (
                      <div key={metric.key}>
                        <div className="flex items-center justify-between text-[11px] font-medium">
                          <span>{metric.label}</span>
                          <span>{metric.score}/100</span>
                        </div>
                        <MetricBars
                          score={metric.score}
                          accent={option.accent}
                          disabled={optionDisabled}
                        />
                      </div>
                    ))}
                  </div>

                  {option.requiresOnline && (
                    <span className="text-xs font-medium text-blue-600 dark:text-blue-300">Requires connectivity</span>
                  )}

                  {optionDisabled && option.requiresOnline && strictOffline && (
                    <span className="text-xs font-medium text-neutral-muted">Turn off strict offline mode to enable</span>
                  )}

                  {optionDisabled && !option.requiresOnline && (
                    <span className="text-xs font-medium text-neutral-muted">Coming soon</span>
                  )}

                  {isSelected && (
                    <CheckCircle className="absolute top-3 right-3 h-5 w-5 text-emerald-500" />
                  )}
                </button>
              );
            })}
          </div>

          {(() => {
            if (provider === 'auto') {
              return (
                <div className="rounded-lg border border-dashed border-border/70 bg-surface-subtle p-4 text-sm text-neutral-muted">
                  <p className="font-medium text-neutral">Automatic provider selection</p>
                  <p className="mt-1 leading-relaxed">
                    The auto mode will choose between local and cloud providers dynamically. This feature is under
                    development—watch the release notes for availability.
                  </p>
                </div>
              );
            }

            const active = providerOptions.find((opt) => opt.value === provider) ?? providerOptions[0];
            if (!active) {
              return null;
            }
            const isCloud = active.deployment === 'cloud';
            return (
              <div className="rounded-lg border border-dashed border-border/70 bg-surface-subtle p-4 text-sm text-neutral-muted">
                <p className="font-medium text-neutral">
                  {isCloud
                    ? 'Cloud connectivity enabled'
                    : 'Fully offline local deployment'}
                </p>
                <p className="mt-1 leading-relaxed">
                  {isCloud
                    ? 'Inference requests are routed to secure cloud endpoints once strict offline mode is disabled. Provisioning will download the recommended model automatically when available.'
                    : 'All model weights stay on this device. No prompts or responses leave your network.'}
                </p>
                {active.value === 'openai' && (
                  <p className="mt-2 text-xs text-neutral-muted">
                    ChurnVision masks employee names, identifiers, and sensitive fields before contacting OpenAI. The
                    masked response is unmasked locally before rendering.
                  </p>
                )}
              </div>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );


  const performReset = useCallback(async () => {
     try {
        uiLogger.info('Starting application state reset...');
        
        // Clear localStorage items
        try {
            localStorage.removeItem('churnvision-theme');
            Object.keys(localStorage)
                .filter(key => key.startsWith('churnvision-onboarding-completed-'))
                .forEach(key => localStorage.removeItem(key));
            Object.keys(localStorage)
                .filter(key => key.startsWith('chatbot_'))
                .forEach(key => localStorage.removeItem(key));
            localStorage.removeItem('employee_data_cache');
            localStorage.removeItem('user');
            localStorage.removeItem('remember_me');
            localStorage.removeItem('stored_email');
            uiLogger.info('Cleared relevant localStorage items.');
        } catch (e) {
            uiLogger.error('Error clearing localStorage:', e);
        }

        // Clear sessionStorage
        try {
            sessionStorage.clear();
            uiLogger.info('Cleared sessionStorage.');
        } catch (e) {
             uiLogger.error('Error clearing sessionStorage:', e);
        }

        uiLogger.info('Application state reset complete. Navigating...');
        navigate('/'); 

      } catch (error) {
        uiLogger.error('Error during application state reset:', error as any);
        toast({ title: 'Reset failed', description: 'An error occurred while resetting the application state.', variant: 'destructive' });
      } finally {
         setIsResetAlertOpen(false);
      }
  }, [navigate, toast]);

  const handleActivateLicense = useCallback(async () => {
    if (!licenseKeyInput.trim()) {
        toast({ title: 'License key required', description: 'Please enter a license key.', variant: 'destructive' });
        return;
    }
    uiLogger.info('Attempting to activate license key:', { keyPreview: licenseKeyInput.slice(0, 6) + '…' });
    toast({ title: 'Activation requested', description: `Key: ${licenseKeyInput.slice(0, 6)}… (implement actual activation)` });
  }, [licenseKeyInput, toast]);

  const handleProjectBaseDirSave = useCallback(async () => {
    try {
      setIsSavingBaseDir(true);
      await api.post('/api/projects/base-dir', { baseDir: projectsBaseDir.trim() });
      toast({ title: 'Success', description: 'Projects directory saved successfully.' });
    } catch (e: any) {
      toast({ title: 'Failed to set projects directory', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setIsSavingBaseDir(false);
    }
  }, [projectsBaseDir, toast]);

  const handleProjectBaseDirLoad = useCallback(async () => {
    try {
      const resp = await api.get('/api/projects/base-dir');
      setProjectsBaseDir(resp.data?.baseDir || '');
    } catch {
      setProjectsBaseDir('');
    }
  }, []);

  // Handle loading state
  if (isLicenseLoading) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
              <div className="flex flex-col items-center gap-4">
                 <motion.div
                   animate={{ rotate: 360 }}
                   transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                 >
                   <SettingsIcon className="w-8 h-8 text-blue-500" />
                 </motion.div>
                 <p className="text-gray-600 dark:text-gray-400 font-medium">Loading Settings...</p>
              </div>
          </div>
      );
  }
  
  // Handle error state
   if (licenseError || licenseStatus === 'ERROR') {
      return (
           <div className="min-h-screen flex items-center justify-center p-6 bg-red-50 dark:bg-red-900/20">
             <Card className="max-w-md w-full border-red-300 dark:border-red-700 bg-white dark:bg-gray-800 shadow-lg">
                <CardHeader className="text-center">
                    <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <CardTitle className="text-red-700 dark:text-red-300">Error Loading Settings</CardTitle>
                    <CardDescription className="text-red-600 dark:text-red-400">
                        {licenseError || 'Could not load license information. Please try again later or contact support.'}
                    </CardDescription>
                </CardHeader>
             </Card>
           </div>
      );
   }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <motion.div 
        className="max-w-7xl mx-auto p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
              <SettingsIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100">
                Settings
              </h1>
              <p className="text-gray-600 dark:text-gray-400">Manage your application preferences and configuration</p>
            </div>
          </div>
        </div>

        {/* Settings Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Navigation Sidebar */}
          <div className="lg:col-span-1">
            <Card className="p-4 sticky top-6">
              <SettingsNavigation 
                sections={settingsSections}
                activeSection={activeSection}
                onSectionChange={setActiveSection}
              />
            </Card>
          </div>

          {/* Content Area */}
          <div className="lg:col-span-3">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                {activeSection === 'general' && (
                  <GeneralSettings 
                    notificationsEnabled={notificationsEnabled}
                    setNotificationsEnabled={setNotificationsEnabled}
                    autoSaveEnabled={autoSaveEnabled}
                    setAutoSaveEnabled={setAutoSaveEnabled}
                    dataMode={dataMode}
                    setDataMode={setDataMode}
                    resetOnboarding={resetOnboarding}
                  />
                )}
                
                {activeSection === 'license' && (
                  <LicenseSettings 
                    licenseStatus={licenseStatus}
                    licenseData={licenseData}
                    gracePeriodEnds={gracePeriodEnds}
                    licenseTier={licenseTier}
                    licenseKeyInput={licenseKeyInput}
                    setLicenseKeyInput={setLicenseKeyInput}
                    handleActivateLicense={handleActivateLicense}
                  />
                )}
                
                {activeSection === 'appearance' && (
                  <AppearanceSettings />
                )}

                {activeSection === 'ai' && aiSection}
                
                {activeSection === 'data' && (
                  <DataSettings 
                    projectsBaseDir={projectsBaseDir}
                    setProjectsBaseDir={setProjectsBaseDir}
                    isSavingBaseDir={isSavingBaseDir}
                    handleProjectBaseDirSave={handleProjectBaseDirSave}
                    handleProjectBaseDirLoad={handleProjectBaseDirLoad}
                  />
                )}
                
                {activeSection === 'security' && (
                  <SecuritySettings />
                )}
                
                {activeSection === 'advanced' && (
                  <AdvancedSettings 
                    isResetAlertOpen={isResetAlertOpen}
                    setIsResetAlertOpen={setIsResetAlertOpen}
                    performReset={performReset}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// Settings section components
const GeneralSettings = ({ notificationsEnabled, setNotificationsEnabled, autoSaveEnabled, setAutoSaveEnabled, dataMode, setDataMode, resetOnboarding }: {
  notificationsEnabled: boolean;
  setNotificationsEnabled: (enabled: boolean) => void;
  autoSaveEnabled: boolean;
  setAutoSaveEnabled: (enabled: boolean) => void;
  dataMode: 'wage' | 'performance';
  setDataMode: (mode: 'wage' | 'performance') => void;
  resetOnboarding: () => void;
}) => (
  <div className="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="w-5 h-5 text-blue-600" />
          General Preferences
        </CardTitle>
        <CardDescription>Configure basic application settings</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label>Enable Notifications</Label>
            <p className="text-sm text-gray-500">Receive app notifications and alerts</p>
          </div>
          <Switch checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} />
        </div>
        
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label>Auto-save Changes</Label>
            <p className="text-sm text-gray-500">Automatically save your work</p>
          </div>
          <Switch checked={autoSaveEnabled} onCheckedChange={setAutoSaveEnabled} />
        </div>
        
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label>Analysis Mode</Label>
            <div className="text-sm text-gray-500 space-y-1">
              <p>Wage: Uses salary & ELTV for financial analysis</p>
              <p>Performance: Uses ratings & RVI for talent focus</p>
            </div>
          </div>
          <Button
            variant={dataMode === 'wage' ? 'default' : 'outline'}
            onClick={() => {
              const next = dataMode === 'wage' ? 'performance' : 'wage';
              setDataMode(next);
              localStorage.setItem('settings.dataMode', next);
            }}
          >
            {dataMode === 'wage' ? 'Wage Mode' : 'Performance Mode'}
          </Button>
        </div>
        
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="space-y-1">
            <Label>Onboarding Tutorial</Label>
            <p className="text-sm text-gray-500">Restart the welcome tutorial</p>
          </div>
          <Button variant="outline" onClick={resetOnboarding}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Restart Tutorial
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>
);

const LicenseSettings = ({ licenseStatus, licenseData, gracePeriodEnds, licenseTier, licenseKeyInput, setLicenseKeyInput, handleActivateLicense }: {
  licenseStatus: string;
  licenseData: any;
  gracePeriodEnds: string | number | null | undefined;
  licenseTier: LicenseTier;
  licenseKeyInput: string;
  setLicenseKeyInput: (key: string) => void;
  handleActivateLicense: () => void;
}) => (
  <div className="space-y-6">
    {/* License Status Card */}
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-green-600" />
          License Status
        </CardTitle>
        <CardDescription>Current license information and activation</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SettingsRow
          label="Status"
          value={
            <span className={cn(
              "text-xs font-semibold px-3 py-1 rounded-full inline-flex items-center gap-1.5",
              licenseStatus === 'ACTIVE'
                ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                : licenseStatus === 'GRACE_PERIOD'
                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'
                : 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
            )}>
              {licenseStatus === 'ACTIVE' && <ShieldCheck className="w-3.5 h-3.5" />}
              {licenseStatus === 'GRACE_PERIOD' && <Hourglass className="w-3.5 h-3.5" />}
              {licenseStatus !== 'ACTIVE' && licenseStatus !== 'GRACE_PERIOD' && <AlertTriangle className="w-3.5 h-3.5" />}
              {licenseStatus.replace('_', ' ')}
            </span>
          }
          icon={ShieldCheck}
        />
        
        {licenseData?.tier && (
          <SettingsRow label="Current Tier" value={getLicenseTierDisplayName(licenseTier)} icon={Crown} />
        )}
        
        {licenseData?.expiryDate && (
          <SettingsRow
            label="Expires"
            value={new Date(licenseData.expiryDate).toLocaleDateString()}
            icon={CalendarDays}
          />
        )}
        
        {licenseStatus === 'GRACE_PERIOD' && gracePeriodEnds && (
          <SettingsRow
            label="Grace Period Ends"
            value={<span className="text-yellow-700 dark:text-yellow-400">{new Date(gracePeriodEnds).toLocaleString()}</span>}
            icon={Hourglass}
          />
        )}
      </CardContent>
    </Card>

    {/* License Activation Card */}
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-blue-600" />
          Activate License
        </CardTitle>
        <CardDescription>Enter a new license key to activate or upgrade</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="Paste your license key here"
            value={licenseKeyInput}
            onChange={(e) => setLicenseKeyInput(e.target.value)}
            className="flex-1"
          />
          <Button
            onClick={handleActivateLicense}
            disabled={!licenseKeyInput.trim()}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Activate
          </Button>
        </div>
      </CardContent>
    </Card>

    {/* License Tiers Overview */}
    <Card className="overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20">
        <CardTitle className="flex items-center gap-2">
          <Crown className="w-5 h-5 text-purple-600" />
          Available Plans
        </CardTitle>
        <CardDescription>Compare features across different license tiers</CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(['starter', 'pro', 'enterprise'] as LicenseTier[]).map((tier) => {
            const isCurrentTier = licenseTier === tier;
            const tierConfig = {
              starter: { name: 'Starter', features: ['Dashboard', 'Data Management', 'Basic Analytics'], color: 'blue' },
              pro: { name: 'Pro', features: ['All Starter Features', 'AI Assistant', 'Employee Insights'], color: 'emerald' },
              enterprise: { name: 'Enterprise', features: ['All Pro Features', 'Playground', 'Full API Access'], color: 'purple' }
            };
            const config = tierConfig[tier];
            return (
              <div
                key={tier}
                className={cn(
                  'p-4 rounded-lg border-2 transition-all',
                  isCurrentTier 
                    ? `border-${config.color}-400 bg-${config.color}-50 dark:bg-${config.color}-900/20` 
                    : 'border-gray-200 dark:border-gray-700'
                )}
              >
                {isCurrentTier && (
                  <div className="text-xs font-bold text-center mb-2 text-blue-600 dark:text-blue-400">
                    CURRENT PLAN
                  </div>
                )}
                <h3 className="font-semibold text-center mb-3">{config.name}</h3>
                <ul className="space-y-1 text-sm">
                  {config.features.map((feature, idx) => (
                    <li key={idx} className="flex items-center">
                      <div className={`w-2 h-2 rounded-full bg-${config.color}-500 mr-2 flex-shrink-0`} />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  </div>
);

const AppearanceSettings = () => (
  <div className="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="w-5 h-5 text-blue-600" />
          Theme & Display
        </CardTitle>
        <CardDescription>Customize the app's visual appearance</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label>Color Theme</Label>
            <p className="text-sm text-gray-500">Choose between light and dark mode</p>
          </div>
          <ThemeToggle />
        </div>
      </CardContent>
    </Card>
  </div>
);

interface ProviderArtifact {
  type: string;
  format: string;
  source: string;
  repo: string;
  filename: string;
  size?: number | null;
  sha256?: string | null;
}

interface ProviderCatalogEntry {
  id: string;
  label: string;
  description: string;
  deployment: 'local' | 'cloud';
  version?: string;
  badge?: string;
  metrics: {
    speed: number;
    performance: number;
    intelligence: number;
  };
  artifact?: ProviderArtifact;
  requiresApiKey?: boolean;
  requiresOnline?: boolean;
  api?: {
    baseUrl: string;
    model: string;
  };
}

interface ProviderInstallationStatus {
  status?: string;
  path?: string | null;
  size?: number | null;
  sha256?: string | null;
  updatedAt?: number;
  version?: string | null;
  downloadedBytes?: number;
  totalBytes?: number;
  percent?: number | null;
  error?: string | null;
}

interface ProviderCatalogManifest {
  providers: ProviderCatalogEntry[];
}

interface ProviderOption {
  id: string;
  value: AIProviderType;
  label: string;
  description: string;
  badge?: string;
  icon: 'churnvision' | 'microsoft' | 'qwen' | 'openai' | 'mistral' | 'ibm';
  deployment: 'local' | 'cloud';
  accent: string;
  metrics: {
    speed: number;
    performance: number;
    intelligence: number;
  };
  artifact?: ProviderArtifact;
  requiresOnline: boolean;
  requiresApiKey?: boolean;
  disabled?: boolean;
  status?: ProviderInstallationStatus;
  isProvisioning?: boolean;
}

const providerIconMap: Record<ProviderOption['icon'], string> = {
  churnvision: churnVisionIcon,
  microsoft: microsoftIcon,
  qwen: qwenIcon,
  openai: openaiIcon,
  mistral: mistralIcon,
  ibm: ibmIcon,
};

const accentLookup: Record<string, string> = {
  local: 'bg-emerald-500',
  microsoft: 'bg-blue-500',
  qwen: 'bg-purple-500',
  mistral: 'bg-orange-500',
  ibm: 'bg-sky-500',
  openai: 'bg-indigo-500',
  auto: 'bg-slate-500',
};

const renderProviderIcon = (brand: ProviderOption['icon']) => (
  <img
    src={providerIconMap[brand]}
    alt={`${brand} logo`}
    className="h-12 w-12 rounded-full shadow-sm ring-1 ring-black/5"
    draggable={false}
  />
);

const MetricBars: React.FC<{ score: number; accent: string; disabled?: boolean }> = ({ score, accent, disabled }) => {
  // Convert 0-100 score to 0-10 bars (each bar represents 10 points)
  const filledBars = Math.round(score / 10);
  return (
    <div className="mt-1 flex gap-0.5">
      {Array.from({ length: 10 }).map((_, idx) => (
        <div
          key={idx}
          className={cn(
            'h-1.5 flex-1 rounded-full transition-colors',
            idx < filledBars ? accent : 'bg-border/60',
            disabled && 'opacity-40'
          )}
        />
      ))}
    </div>
  );
};

type AIProviderType =
  | 'local'
  | 'openai'
  | 'auto'
  | 'microsoft'
  | 'qwen'
  | 'mistral'
  | 'ibm';

const AI_PROVIDER_VALUES: readonly AIProviderType[] = (
  ['local', 'openai', 'auto', 'microsoft', 'qwen', 'mistral', 'ibm'] as const
);

const isValidAIProvider = (value: unknown): value is AIProviderType =>
  typeof value === 'string' && (AI_PROVIDER_VALUES as readonly string[]).includes(value as string);

// Inline provider catalog (previously imported from @shared/providerCatalog.json)
// Model tiers:
// - Default (local): Qwen 3 4B - privacy-focused, offline operation
// - Standard cloud: OpenAI GPT-5.1, Azure OpenAI, Qwen3-Max, Mistral Large 3
// - Enterprise: IBM Granite 3.0 for Trust/Safety/RAG faithfulness
const manifestProviders: ProviderCatalogEntry[] = [
  {
    id: 'local',
    label: 'ChurnVision Local',
    description: 'Qwen 3 4B - Privacy-focused, offline operation, no external calls',
    deployment: 'local',
    badge: 'Default',
    metrics: { speed: 85, performance: 88, intelligence: 86 }
  },
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'GPT-5.1 - Highest intelligence and speed',
    deployment: 'cloud',
    badge: 'Most Advanced',
    metrics: { speed: 98, performance: 98, intelligence: 100 }
  },
  {
    id: 'microsoft',
    label: 'Azure OpenAI',
    description: 'GPT-5.1 via Azure - Enterprise-grade with Azure compliance',
    deployment: 'cloud',
    badge: 'Enterprise',
    metrics: { speed: 97, performance: 98, intelligence: 100 }
  },
  {
    id: 'qwen',
    label: 'Qwen3-Max',
    description: 'Alibaba Cloud - Excellent cost/performance, strong in Asian markets',
    deployment: 'cloud',
    metrics: { speed: 94, performance: 93, intelligence: 94 }
  },
  {
    id: 'mistral',
    label: 'Mistral Large 3',
    description: 'European AI - Very high intelligence, open-weight model',
    deployment: 'cloud',
    badge: 'European',
    metrics: { speed: 93, performance: 95, intelligence: 97 }
  },
  {
    id: 'ibm',
    label: 'IBM Granite 3.0',
    description: 'Enterprise AI - Top-tier Trust, Safety & RAG faithfulness',
    deployment: 'cloud',
    badge: 'Trust & Safety',
    metrics: { speed: 88, performance: 92, intelligence: 91 }
  },
  {
    id: 'auto',
    label: 'Auto-Select',
    description: 'Smart selection based on tenant preferences and query complexity',
    deployment: 'local',
    badge: 'Smart',
    metrics: { speed: 95, performance: 95, intelligence: 96 }
  }
];

const LAST_LOCAL_PROVIDER_KEY = 'churnvision-last-local-provider';

const providerLabelLookup: Record<string, string> = manifestProviders.reduce((acc, entry) => {
  acc[entry.id] = entry.label;
  return acc;
}, {} as Record<string, string>);

const iconLookup: Record<string, ProviderOption['icon']> = {
  local: 'churnvision',
  microsoft: 'microsoft',
  qwen: 'qwen',
  mistral: 'mistral',
  ibm: 'ibm',
  openai: 'openai',
  auto: 'churnvision',
};

const isLocalProviderId = (value: unknown): value is AIProviderType => {
  if (!isValidAIProvider(value)) {
    return false;
  }
  const entry = manifestProviders.find(provider => provider.id === value);
  return entry?.deployment === 'local';
};

const formatBytes = (bytes?: number | null) => {
  if (bytes == null || Number.isNaN(bytes)) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  const decimals = unit === 0 ? 0 : value < 10 ? 1 : 0;
  return `${value.toFixed(decimals)} ${units[unit]}`;
};

const DataSettings = ({ projectsBaseDir, setProjectsBaseDir, isSavingBaseDir, handleProjectBaseDirSave, handleProjectBaseDirLoad }: {
  projectsBaseDir: string;
  setProjectsBaseDir: (dir: string) => void;
  isSavingBaseDir: boolean;
  handleProjectBaseDirSave: () => void;
  handleProjectBaseDirLoad: () => void;
}) => (
  <div className="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-green-600" />
          Project Directory
        </CardTitle>
        <CardDescription>Configure where your project files are stored</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <Label>Base Directory Path</Label>
          <div className="flex gap-2">
            <Input
              type="text"
              value={projectsBaseDir}
              onChange={(e) => setProjectsBaseDir(e.target.value)}
              placeholder="/path/to/projects"
              className="flex-1"
            />
            <Button
              variant="outline"
              disabled={isSavingBaseDir || !projectsBaseDir.trim()}
              onClick={handleProjectBaseDirSave}
            >
              {isSavingBaseDir ? 'Saving...' : 'Save'}
            </Button>
            <Button variant="ghost" onClick={handleProjectBaseDirLoad}>
              Load
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="w-5 h-5 text-indigo-600" />
          Data Sources
        </CardTitle>
        <CardDescription>Manage external data connections</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
          <Database className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-500 dark:text-gray-400">Data source management coming soon</p>
        </div>
      </CardContent>
    </Card>
  </div>
);

const SecuritySettings: React.FC = () => {
  const [strictOffline, setStrictOffline] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const response = await api.get('/settings/offline-mode');
      setStrictOffline(!!response.data?.enabled);
    } catch (error) {
      console.error('Failed to load offline mode:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleStrict = useCallback(async (enabled: boolean) => {
    setStrictOffline(enabled);
    try {
      await api.post('/settings/offline-mode', { enabled });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('churnvision:strict-offline-changed', { detail: enabled }));
      }
      if (!enabled) {
        toast({
          title: 'Strict offline mode disabled',
          description:
            'Cloud AI providers, automatic model downloads, and masked cloud inference are now available.',
        });
      } else {
        toast({
          title: 'Strict offline mode enabled',
          description: 'All outbound requests are blocked. Cloud AI providers are temporarily unavailable.',
        });
      }
    } catch (e) {
      // revert on failure
      setStrictOffline(!enabled);
    }
  }, [toast]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-red-600" />
            Privacy & Security
          </CardTitle>
          <CardDescription>Manage security and privacy settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <div className="font-medium">Strict Offline Mode</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Blocks all external network access (local/localhost allowed)</div>
            </div>
            <div className="flex items-center gap-2">
              {loading ? (
                <span className="text-sm text-gray-500">Loading…</span>
              ) : (
                <Switch checked={strictOffline} onCheckedChange={toggleStrict} />
              )}
            </div>
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <div className="font-medium">Diagnostics</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">View DB health and local LLM status</div>
            </div>
            <Button variant="outline" onClick={() => navigate('/diagnostics')}>Open</Button>
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <div className="font-medium">Provision Local Model</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Create a local LLM from the bundled Modelfile (offline)</div>
            </div>
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  const response = await api.post('/ai/provision-provider', { provider_id: 'local' });
                  if (response.data?.success) {
                    alert('Model provisioned successfully.');
                  } else {
                    throw new Error(response.data?.message || 'Provisioning failed');
                  }
                } catch (e) {
                  const msg = (e && (e as any).response?.data?.detail) || (e && (e as any).message) ? (e as any).message : String(e);
                  alert(`Provisioning failed: ${msg}`);
                }
              }}
            >
              Provision
            </Button>
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg opacity-50">
            <div>
              <div className="font-medium">Export Encrypted Backup</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Desktop application only - use Data Management page for exports</div>
            </div>
            <Button
              variant="outline"
              disabled
              title="This feature is only available in the desktop application"
            >
              Export
            </Button>
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg opacity-50">
            <div>
              <div className="font-medium">Organization Knowledge Base</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Desktop application only - RAG requires local file system access</div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                disabled
                title="This feature is only available in the desktop application"
              >
                Add Files
              </Button>
              <Button
                variant="outline"
                disabled
                title="This feature is only available in the desktop application"
              >
                Stats
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const AdvancedSettings = ({ isResetAlertOpen, setIsResetAlertOpen, performReset }: {
  isResetAlertOpen: boolean;
  setIsResetAlertOpen: (open: boolean) => void;
  performReset: () => void;
}) => (
  <div className="space-y-6">
    <Card className="border-red-200 dark:border-red-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-300">
          <AlertTriangle className="w-5 h-5" />
          Danger Zone
        </CardTitle>
        <CardDescription className="text-red-600 dark:text-red-400">
          These actions are permanent and cannot be undone
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-4 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="space-y-1">
            <p className="font-medium text-gray-900 dark:text-gray-100">Reset Application State</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Clear all local data, settings, and cached information
            </p>
          </div>
          <AlertDialog open={isResetAlertOpen} onOpenChange={setIsResetAlertOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="w-4 h-4 mr-2" />
                Reset
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset Application State?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will clear all local settings, cached data, and user preferences. 
                  Your license information will be preserved. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={performReset} className="bg-red-600 hover:bg-red-700">
                  Yes, Reset Everything
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  </div>
);

export default Settings; 
