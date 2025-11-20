import { createFileRoute } from '@tanstack/react-router'
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Settings as SettingsIcon,
  Crown,
  Palette,
  Bot,
  Database,
  Lock,
  Monitor,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Save
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useLicense, getLicenseTierDisplayName } from '@/providers/LicenseProvider';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

export const Route = createFileRoute('/settings')({
  component: Settings,
})

// Settings section types
type SettingsSection = 'general' | 'license' | 'appearance' | 'ai' | 'data' | 'security' | 'advanced';

interface SettingsSectionData {
  id: SettingsSection;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
}

function Settings() {
  const { licenseTier, licenseData } = useLicense();
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState<SettingsSection>('general');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [dataMode, setDataMode] = useState<'wage' | 'performance'>('wage');
  const [aiProvider, setAiProvider] = useState('openai');

  const settingsSections: SettingsSectionData[] = useMemo(() => [
    { id: 'general', title: 'General', description: 'Basic app settings', icon: SettingsIcon, color: 'text-gray-600' },
    { id: 'license', title: 'License & Plans', description: 'Manage your subscription', icon: Crown, color: 'text-purple-600' },
    { id: 'appearance', title: 'Appearance', description: 'Theme and display', icon: Palette, color: 'text-blue-600' },
    { id: 'ai', title: 'AI & Models', description: 'Choose AI provider', icon: Bot, color: 'text-emerald-600' },
    { id: 'data', title: 'Data & Storage', description: 'Data sources and paths', icon: Database, color: 'text-green-600' },
    { id: 'security', title: 'Security', description: 'Privacy and security', icon: Lock, color: 'text-red-600' },
    { id: 'advanced', title: 'Advanced', description: 'Developer options', icon: Monitor, color: 'text-orange-600' }
  ], []);

  const handleSave = () => {
    toast({
      title: "Settings Saved",
      description: "Your preferences have been updated successfully.",
    });
  };

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-900/50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Settings</h1>
            <p className="text-slate-500 dark:text-slate-400">Manage your application preferences and configuration</p>
          </div>
          <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </div>

        <div className="grid grid-cols-12 gap-8">
          {/* Navigation Sidebar */}
          <div className="col-span-12 md:col-span-3 space-y-2">
            {settingsSections.map((section) => (
              <motion.button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all duration-200",
                  activeSection === section.id
                    ? "bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 text-blue-600 dark:text-blue-400"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50"
                )}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <section.icon className={cn("w-5 h-5", activeSection === section.id ? "text-blue-600 dark:text-blue-400" : section.color)} />
                <div>
                  <div className="font-medium text-sm">{section.title}</div>
                  <div className="text-xs opacity-70 hidden lg:block">{section.description}</div>
                </div>
              </motion.button>
            ))}
          </div>

          {/* Content Area */}
          <div className="col-span-12 md:col-span-9">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>{settingsSections.find(s => s.id === activeSection)?.title}</CardTitle>
                  <CardDescription>{settingsSections.find(s => s.id === activeSection)?.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">

                  {activeSection === 'general' && (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-base">Notifications</Label>
                          <p className="text-sm text-muted-foreground">Receive alerts about analysis completion and system updates.</p>
                        </div>
                        <Switch checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-base">Auto-Save</Label>
                          <p className="text-sm text-muted-foreground">Automatically save changes to projects and settings.</p>
                        </div>
                        <Switch checked={autoSaveEnabled} onCheckedChange={setAutoSaveEnabled} />
                      </div>
                    </div>
                  )}

                  {activeSection === 'license' && (
                    <div className="space-y-6">
                      <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800 rounded-lg flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-purple-100 dark:bg-purple-900/40 rounded-full">
                            <Crown className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-purple-900 dark:text-purple-100">
                              {getLicenseTierDisplayName(licenseTier)} Plan
                            </h3>
                            <p className="text-sm text-purple-700 dark:text-purple-300">
                              Active until {licenseData?.expiresAt}
                            </p>
                          </div>
                        </div>
                        <Badge className="bg-purple-600 hover:bg-purple-700">Active</Badge>
                      </div>

                      <div className="space-y-2">
                        <Label>License Key</Label>
                        <div className="flex gap-2">
                          <Input value={licenseData?.key || ''} readOnly className="font-mono bg-slate-50 dark:bg-slate-900" />
                          <Button variant="outline">Update</Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSection === 'appearance' && (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-base">Theme Mode</Label>
                          <p className="text-sm text-muted-foreground">Switch between light and dark modes.</p>
                        </div>
                        <ThemeToggle />
                      </div>
                    </div>
                  )}

                  {activeSection === 'ai' && (
                    <div className="space-y-6">
                      <div className="space-y-4">
                        <Label>AI Provider</Label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {['openai', 'anthropic', 'local', 'azure'].map((p) => (
                            <div
                              key={p}
                              className={cn(
                                "p-4 border rounded-lg cursor-pointer transition-all flex items-center justify-between",
                                aiProvider === p
                                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-500"
                                  : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                              )}
                              onClick={() => setAiProvider(p)}
                            >
                              <span className="capitalize font-medium">{p}</span>
                              {aiProvider === p && <CheckCircle className="w-4 h-4 text-blue-500" />}
                            </div>
                          ))}
                        </div>
                      </div>

                      {aiProvider !== 'local' && (
                        <div className="space-y-2">
                          <Label>API Key</Label>
                          <Input type="password" placeholder="sk-..." />
                          <p className="text-xs text-muted-foreground">Your key is stored locally and never sent to our servers.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {activeSection === 'data' && (
                    <div className="space-y-6">
                      <div className="space-y-4">
                        <Label>Data Analysis Mode</Label>
                        <div className="grid grid-cols-2 gap-4">
                          <div
                            className={cn(
                              "p-4 border rounded-lg cursor-pointer transition-all",
                              dataMode === 'wage'
                                ? "border-green-500 bg-green-50 dark:bg-green-900/20 ring-1 ring-green-500"
                                : "border-slate-200 dark:border-slate-700"
                            )}
                            onClick={() => setDataMode('wage')}
                          >
                            <div className="font-semibold mb-1">Wage Mode</div>
                            <p className="text-xs text-muted-foreground">Includes salary data for ROI calculations.</p>
                          </div>
                          <div
                            className={cn(
                              "p-4 border rounded-lg cursor-pointer transition-all",
                              dataMode === 'performance'
                                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-500"
                                : "border-slate-200 dark:border-slate-700"
                            )}
                            onClick={() => setDataMode('performance')}
                          >
                            <div className="font-semibold mb-1">Performance Mode</div>
                            <p className="text-xs text-muted-foreground">Focuses on retention scores without financial data.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Placeholders for other sections */}
                  {(activeSection === 'security' || activeSection === 'advanced') && (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                      <AlertTriangle className="w-10 h-10 mb-4 opacity-20" />
                      <p>This section is under development.</p>
                    </div>
                  )}

                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
