import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService, SSOConfigResponse, SSOConfigUpdate, SSOTestResult } from '../../services/adminService';
import { useToast } from '../../hooks/use-toast';
import { useAuth } from '../../contexts/AuthContext';
import {
  Shield,
  Globe,
  Key,
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Save,
  TestTube,
  Info,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Skeleton } from '../../components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { cn } from '../../lib/utils';

export function AdminSSO() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Form state
  const [formData, setFormData] = useState<SSOConfigUpdate>({
    enabled: false,
    provider: 'oidc',
    issuer_url: '',
    client_id: '',
    client_secret: '',
    redirect_uri: '',
    scopes: 'openid email profile',
    auto_create_users: true,
    default_role: 'viewer',
    admin_groups: '',
    session_lifetime: 86400,
  });

  const [testResult, setTestResult] = useState<SSOTestResult | null>(null);
  const [hasSecretChanged, setHasSecretChanged] = useState(false);

  // Query
  const { data: config, isLoading } = useQuery({
    queryKey: ['sso-config'],
    queryFn: () => adminService.getSSOConfig(),
  });

  // Check if user is super admin
  const isSuperAdmin = user?.is_superuser;

  // Update form when config loads
  useEffect(() => {
    if (config) {
      setFormData({
        enabled: config.enabled,
        provider: config.provider,
        issuer_url: config.issuer_url || '',
        client_id: config.client_id || '',
        client_secret: '', // Never populate from server
        redirect_uri: config.redirect_uri || '',
        scopes: config.scopes || 'openid email profile',
        auto_create_users: config.auto_create_users,
        default_role: config.default_role || 'viewer',
        admin_groups: config.admin_groups || '',
        session_lifetime: config.session_lifetime || 86400,
      });
      setHasSecretChanged(false);
    }
  }, [config]);

  // Mutations
  const updateMutation = useMutation({
    mutationFn: (data: SSOConfigUpdate) => adminService.updateSSOConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sso-config'] });
      toast({ title: 'SSO configuration saved successfully' });
      setHasSecretChanged(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to save SSO configuration',
        description: error?.response?.data?.detail || error.message,
        variant: 'destructive',
      });
    },
  });

  const testMutation = useMutation({
    mutationFn: () => adminService.testSSOConnection(),
    onSuccess: (result: SSOTestResult) => {
      setTestResult(result);
      queryClient.invalidateQueries({ queryKey: ['sso-config'] });
      if (result.success) {
        toast({ title: 'Connection test successful!' });
      } else {
        toast({ title: 'Connection test failed', description: result.message, variant: 'destructive' });
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Connection test failed',
        description: error?.response?.data?.detail || error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSave = () => {
    // Only include client_secret if it changed
    const dataToSend = { ...formData };
    if (!hasSecretChanged) {
      delete dataToSend.client_secret;
    }
    updateMutation.mutate(dataToSend);
  };

  const handleSecretChange = (value: string) => {
    setFormData({ ...formData, client_secret: value });
    setHasSecretChanged(true);
  };

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Shield className="h-12 w-12 text-neutral-muted mb-4" />
        <h2 className="text-lg font-semibold text-foreground mb-2">Super Admin Access Required</h2>
        <p className="text-neutral-muted max-w-md">
          Only super administrators can configure Single Sign-On settings.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Single Sign-On Configuration
          </h2>
          <p className="text-sm text-neutral-muted mt-1">
            Configure OIDC-based SSO to allow users to sign in with your identity provider
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => testMutation.mutate()}
            disabled={!formData.issuer_url || testMutation.isPending}
          >
            {testMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <TestTube className="h-4 w-4 mr-2" />
            )}
            Test Connection
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Configuration
          </Button>
        </div>
      </div>

      {/* Status Banner */}
      {config && (
        <div className={cn(
          'flex items-center gap-3 px-4 py-3 rounded-lg border',
          config.enabled
            ? 'bg-green-500/10 border-green-500/30 text-green-600'
            : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-600'
        )}>
          {config.enabled ? (
            <>
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">SSO is enabled</span>
              {config.last_test_success && (
                <span className="text-sm ml-auto">
                  Last tested: {config.last_test_at ? new Date(config.last_test_at).toLocaleString() : 'Never'}
                </span>
              )}
            </>
          ) : (
            <>
              <AlertTriangle className="h-5 w-5" />
              <span className="font-medium">SSO is disabled</span>
              <span className="text-sm">Users can only sign in with username/password</span>
            </>
          )}
        </div>
      )}

      {/* Test Result */}
      {testResult && (
        <div className={cn(
          'flex items-start gap-3 px-4 py-3 rounded-lg border',
          testResult.success
            ? 'bg-green-500/10 border-green-500/30'
            : 'bg-red-500/10 border-red-500/30'
        )}>
          {testResult.success ? (
            <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
          ) : (
            <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
          )}
          <div className="flex-1">
            <p className={cn('font-medium', testResult.success ? 'text-green-600' : 'text-red-600')}>
              {testResult.message}
            </p>
            {testResult.issuer_info && (
              <div className="mt-2 text-sm text-neutral-muted space-y-1">
                <p>Issuer: {testResult.issuer_info.issuer}</p>
                <p>Auth Endpoint: {testResult.issuer_info.authorization_endpoint}</p>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTestResult(null)}
            className="text-neutral-muted"
          >
            Dismiss
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* OIDC Settings */}
        <div className="bg-background rounded-lg border border-border p-5">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
            <Globe className="h-4 w-4" />
            Identity Provider Settings
          </h3>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Label className="w-24">Enable SSO</Label>
              <button
                type="button"
                role="switch"
                aria-checked={formData.enabled}
                onClick={() => setFormData({ ...formData, enabled: !formData.enabled })}
                className={cn(
                  'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                  formData.enabled ? 'bg-emerald-500' : 'bg-neutral-300 dark:bg-neutral-600'
                )}
              >
                <span
                  className={cn(
                    'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                    formData.enabled ? 'translate-x-6' : 'translate-x-1'
                  )}
                />
              </button>
            </div>

            <div className="space-y-2">
              <Label>Provider</Label>
              <Select
                value={formData.provider}
                onValueChange={(v) => setFormData({ ...formData, provider: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="oidc">OpenID Connect (OIDC)</SelectItem>
                  <SelectItem value="saml" disabled>SAML 2.0 (Coming Soon)</SelectItem>
                  <SelectItem value="ldap" disabled>LDAP/AD (Coming Soon)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Issuer URL *</Label>
              <Input
                value={formData.issuer_url || ''}
                onChange={(e) => setFormData({ ...formData, issuer_url: e.target.value })}
                placeholder="https://login.microsoftonline.com/{tenant}/v2.0"
              />
              <p className="text-xs text-neutral-muted">
                The OIDC discovery endpoint. Must support /.well-known/openid-configuration
              </p>
            </div>

            <div className="space-y-2">
              <Label>Client ID *</Label>
              <Input
                value={formData.client_id || ''}
                onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                placeholder="your-application-client-id"
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                Client Secret *
                {config?.has_client_secret && !hasSecretChanged && (
                  <span className="text-xs text-green-600 font-normal">(configured)</span>
                )}
              </Label>
              <Input
                type="password"
                value={formData.client_secret || ''}
                onChange={(e) => handleSecretChange(e.target.value)}
                placeholder={config?.has_client_secret ? '••••••••••••' : 'Enter client secret'}
              />
              <p className="text-xs text-neutral-muted">
                Leave blank to keep existing secret
              </p>
            </div>

            <div className="space-y-2">
              <Label>Redirect URI</Label>
              <Input
                value={formData.redirect_uri || ''}
                onChange={(e) => setFormData({ ...formData, redirect_uri: e.target.value })}
                placeholder="https://your-domain.com/api/v1/auth/sso/callback"
              />
              <p className="text-xs text-neutral-muted">
                Must match the redirect URI configured in your IdP
              </p>
            </div>

            <div className="space-y-2">
              <Label>Scopes</Label>
              <Input
                value={formData.scopes || ''}
                onChange={(e) => setFormData({ ...formData, scopes: e.target.value })}
                placeholder="openid email profile"
              />
            </div>
          </div>
        </div>

        {/* User Provisioning Settings */}
        <div className="space-y-6">
          <div className="bg-background rounded-lg border border-border p-5">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
              <Users className="h-4 w-4" />
              User Provisioning
            </h3>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Label className="flex-1">Auto-create users on first login</Label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={formData.auto_create_users}
                  onClick={() => setFormData({ ...formData, auto_create_users: !formData.auto_create_users })}
                  className={cn(
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                    formData.auto_create_users ? 'bg-emerald-500' : 'bg-neutral-300 dark:bg-neutral-600'
                  )}
                >
                  <span
                    className={cn(
                      'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                      formData.auto_create_users ? 'translate-x-6' : 'translate-x-1'
                    )}
                  />
                </button>
              </div>

              <div className="space-y-2">
                <Label>Default Role for New Users</Label>
                <Select
                  value={formData.default_role}
                  onValueChange={(v) => setFormData({ ...formData, default_role: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Viewer (Read-only)</SelectItem>
                    <SelectItem value="hr">HR</SelectItem>
                    <SelectItem value="analyst">Analyst</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Admin Groups (optional)</Label>
                <Input
                  value={formData.admin_groups || ''}
                  onChange={(e) => setFormData({ ...formData, admin_groups: e.target.value })}
                  placeholder="ChurnVision-Admins, IT-Admins"
                />
                <p className="text-xs text-neutral-muted">
                  Comma-separated list of IdP groups that grant admin role
                </p>
              </div>
            </div>
          </div>

          <div className="bg-background rounded-lg border border-border p-5">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
              <Clock className="h-4 w-4" />
              Session Settings
            </h3>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Session Lifetime</Label>
                <Select
                  value={String(formData.session_lifetime)}
                  onValueChange={(v) => setFormData({ ...formData, session_lifetime: parseInt(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3600">1 hour</SelectItem>
                    <SelectItem value="14400">4 hours</SelectItem>
                    <SelectItem value="28800">8 hours</SelectItem>
                    <SelectItem value="86400">24 hours</SelectItem>
                    <SelectItem value="604800">7 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Help Section */}
          <div className="bg-blue-500/10 rounded-lg border border-blue-500/30 p-5">
            <h3 className="text-sm font-semibold text-blue-600 flex items-center gap-2 mb-3">
              <Info className="h-4 w-4" />
              Setup Guide
            </h3>
            <div className="text-sm text-neutral-muted space-y-3">
              <p>To configure SSO with your identity provider:</p>
              <ol className="list-decimal list-inside space-y-1.5 ml-2">
                <li>Register a new application in your IdP (Azure AD, Okta, Google, etc.)</li>
                <li>Set the redirect URI to: <code className="bg-blue-500/20 px-1 rounded text-xs">{window.location.origin}/api/v1/auth/sso/callback</code></li>
                <li>Copy the Client ID and Secret from your IdP</li>
                <li>Enter the Issuer URL (e.g., <code className="bg-blue-500/20 px-1 rounded text-xs">https://login.microsoftonline.com/&#123;tenant&#125;/v2.0</code>)</li>
                <li>Save configuration and test the connection</li>
                <li>Enable SSO when the test passes</li>
              </ol>
              <div className="mt-3 pt-3 border-t border-blue-500/20">
                <p className="font-medium text-blue-600 mb-1">Common IdP Issuer URLs:</p>
                <ul className="text-xs space-y-1 ml-2">
                  <li><strong>Azure AD:</strong> https://login.microsoftonline.com/&#123;tenant-id&#125;/v2.0</li>
                  <li><strong>Okta:</strong> https://&#123;domain&#125;.okta.com</li>
                  <li><strong>Google:</strong> https://accounts.google.com</li>
                  <li><strong>Keycloak:</strong> https://&#123;host&#125;/realms/&#123;realm&#125;</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Last Updated Info */}
      {config?.updated_at && (
        <div className="text-sm text-neutral-muted text-right">
          Last updated by {config.updated_by || 'Unknown'} on {new Date(config.updated_at).toLocaleString()}
        </div>
      )}
    </div>
  );
}
