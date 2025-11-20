import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
// import { AlertDialog, AlertDialogTitle, AlertDialogDescription } from '@/components/ui/alert-dialog';
import { Loader2, AlertCircle } from 'lucide-react';
// import { toast } from "@/components/ui/use-toast";

// Import types from the global declaration
// Removed unused LicenseState
// Assuming ActivationResult structure here if not properly exported elsewhere
// import type { ActivationResult } from '../types/electron.d.ts'; 
type ActivationResult = { success?: boolean; error?: string; licenseData?: any };

// Assuming ElectronLicenseApi should be defined globally via preload contextBridge
// If not, define it in a d.ts file or manage the type appropriately
// type ElectronLicenseApi = {
//   getInstallationId: () => Promise<string | null>;
//   activate: (key: string) => Promise<ActivationResult>;
// };

export const ActivationComponent: React.FC = () => {
  const [activationKey, setActivationKey] = useState('');
  const [installationId, setInstallationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // isActivated state is removed, parent component handles transition

  useEffect(() => {
    // Fetch installation ID when component mounts
    const api = (window as any).electronLicenseApi as any | undefined;
    if (!api) {
      console.error("ActivationComponent: Electron License API not found!");
      setError('Activation can only be performed within the desktop application.');
      setInstallationId('N/A (Browser Mode)');
      setIsLoading(false);
      return;
    }
    setIsLoading(true); // Set loading true while fetching ID
    api.getInstallationId()
      .then((id: string | null) => {
        if (id) {
          setInstallationId(id);
        } else {
          setError('Could not retrieve Installation ID.');
        }
      })
      .catch((err: Error) => {
        console.error("Error fetching installation ID:", err);
        setError('Error fetching Installation ID.');
      })
      .finally(() => {
        setIsLoading(false); // Stop loading after attempt
      });
  }, []);

  const handleActivate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activationKey || !installationId || isLoading) {
      // setError('Activation key and Installation ID are required.'); // Already handled by button disabled state
      return;
    }
    const api = (window as any).electronLicenseApi as any | undefined;
    if (!api) {
      setError('Activation API not available in this environment.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result: ActivationResult = await api.activate(activationKey);

      if (result?.success) {
        console.log('Activation successful:', result.licenseData);
        // Parent component (App.tsx) listener will handle state change and UI update
        // No need to set state here
      } else {
        console.error('Activation failed:', result?.error);
        setError(result?.error || 'Activation failed for an unknown reason.');
      }
    } catch (err: any) {
      console.error('IPC call license:activate failed:', err);
      setError(err.message || 'An unexpected error occurred during activation.');
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