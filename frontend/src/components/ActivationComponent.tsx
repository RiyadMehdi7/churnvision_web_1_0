import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertCircle } from 'lucide-react';
import api from '@/services/api';

type ActivationResult = { success?: boolean; error?: string; message?: string; licenseData?: any };

export const ActivationComponent: React.FC = () => {
  const [activationKey, setActivationKey] = useState('');
  const [installationId, setInstallationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch installation ID when component mounts
    const fetchInstallationId = async () => {
      setIsLoading(true);
      try {
        const response = await api.get('/license/installation-id');
        if (response.data?.installation_id) {
          setInstallationId(response.data.installation_id);
        } else {
          setError('Could not retrieve Installation ID.');
        }
      } catch (err: any) {
        console.error("Error fetching installation ID:", err);
        setError(err.response?.data?.detail || 'Error fetching Installation ID.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchInstallationId();
  }, []);

  const handleActivate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activationKey || !installationId || isLoading) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await api.post('/license/activate', {
        license_key: activationKey,
        installation_id: installationId
      });

      const result: ActivationResult = response.data;

      if (result?.success) {
        console.log('Activation successful:', result.licenseData);
        // Trigger a custom event to notify LicenseProvider
        window.dispatchEvent(new CustomEvent('license:activated', { detail: result.licenseData }));
        // Parent component will handle state change and UI update
      } else {
        console.error('Activation failed:', result?.message || result?.error);
        setError(result?.message || result?.error || 'Activation failed for an unknown reason.');
      }
    } catch (err: any) {
      console.error('License activation API call failed:', err);
      const errorMsg = err.response?.data?.detail || err.message || 'An unexpected error occurred during activation.';
      setError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    // The parent container in App.tsx handles the centering (flex items-center justify-center)
    <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
            <CardTitle className="text-2xl font-semibold">Activate ChurnVision</CardTitle>
            <CardDescription>Enter your license key to activate the application.</CardDescription>
        </CardHeader>
        <CardContent>
            <form onSubmit={handleActivate} className="space-y-6">
                {error && (
                    // Use styled div for error message consistency
                    <div role="alert" className="p-3 rounded-md border bg-destructive/10 border-destructive text-destructive text-sm">
                        <AlertCircle className="h-4 w-4 inline-block mr-1.5 relative -top-px" />
                        {error}
                    </div>
                )}
                <div className="space-y-2">
                    <Label htmlFor="installationId">Installation ID</Label>
                    <Input
                        id="installationId"
                        type="text"
                        value={installationId || 'Loading...'}
                        readOnly
                        disabled
                        className="bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="activationKey">Activation Key</Label>
                    <Input
                        id="activationKey"
                        type="text"
                        value={activationKey}
                        onChange={(e) => setActivationKey(e.target.value)}
                        placeholder="XXXX-XXXX-XXXX-XXXX"
                        required
                        disabled={isLoading || !installationId}
                    />
                </div>
                <Button
                    type="submit"
                    disabled={isLoading || !installationId || !activationKey}
                    className="w-full bg-app-green hover:bg-app-green/90 text-white dark:text-gray-950"
                >
                    {isLoading ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Activating...</>
                    ) : (
                        'Activate'
                    )}
                </Button>
            </form>
        </CardContent>
        {/* <CardFooter className="text-center text-xs text-gray-500">
            Need help? Contact support.
        </CardFooter> */}
    </Card>
  );
}; 