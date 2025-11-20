import React, { useState, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  Download,
  Upload,
  Shield,
  Clock,
  HardDrive,
  AlertCircle,
  CheckCircle,
  Calendar,
  FileArchive,
  Key,
} from 'lucide-react';

interface BackupSchedule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'manual';
  time: string;
  lastBackup?: string;
  nextBackup?: string;
}

interface BackupInfo {
  fileName: string;
  size: number;
  createdAt: string;
  encrypted: boolean;
  version: string;
}

const BackupRestoreManager: React.FC = () => {
  const [backupProgress, setBackupProgress] = useState<number>(0);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [backupPassword, setBackupPassword] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<BackupInfo | null>(null);
  const [backupSchedule, setBackupSchedule] = useState<BackupSchedule>({
    frequency: 'weekly',
    time: '02:00',
  });
  const [recentBackups, setRecentBackups] = useState<BackupInfo[]>([
    {
      fileName: 'churnvision_backup_20241106_143022.cvbak',
      size: 15728640, // 15 MB
      createdAt: '2024-11-06T14:30:22Z',
      encrypted: true,
      version: '2.0.1',
    },
    {
      fileName: 'churnvision_backup_20241030_020000.cvbak',
      size: 14680064, // 14 MB
      createdAt: '2024-10-30T02:00:00Z',
      encrypted: true,
      version: '2.0.0',
    },
  ]);

  const [backupStatus, setBackupStatus] = useState<{
    type: 'success' | 'error' | 'warning' | null;
    message: string;
  }>({ type: null, message: '' });

  const handleBackup = useCallback(async () => {
    setShowPasswordDialog(true);
  }, []);

  const performBackup = useCallback(async () => {
    setIsBackingUp(true);
    setBackupProgress(0);
    setShowPasswordDialog(false);

    try {
      // Simulate backup progress
      for (let i = 0; i <= 100; i += 10) {
        setBackupProgress(i);
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      // Call electron API for actual backup
      const result = await (window as any).electronAPI?.createBackup({
        password: backupPassword,
        includeSettings: true,
        includeData: true,
        includeLicense: true,
      });

      if (result?.success) {
        const newBackup: BackupInfo = {
          fileName: result.fileName,
          size: result.size,
          createdAt: new Date().toISOString(),
          encrypted: true,
          version: result.version,
        };

        setRecentBackups([newBackup, ...recentBackups.slice(0, 4)]);
        setBackupStatus({
          type: 'success',
          message: `Backup created successfully: ${result.fileName}`,
        });
      }
    } catch (error) {
      console.error('Backup error:', error);
      setBackupStatus({
        type: 'error',
        message: 'Failed to create backup. Please try again.',
      });
    } finally {
      setIsBackingUp(false);
      setBackupProgress(0);
      setBackupPassword('');
    }
  }, [backupPassword, recentBackups]);

  const handleRestore = useCallback(async (backup: BackupInfo) => {
    setSelectedBackup(backup);
    setShowRestoreDialog(true);
  }, []);

  const performRestore = useCallback(async () => {
    if (!selectedBackup) return;

    setIsRestoring(true);
    setShowRestoreDialog(false);

    try {
      // Call electron API for restore
      const result = await (window as any).electronAPI?.restoreBackup({
        fileName: selectedBackup.fileName,
        password: restorePassword,
      });

      if (result?.success) {
        setBackupStatus({
          type: 'success',
          message: 'Backup restored successfully. Application will restart.',
        });

        // Restart application after restore
        setTimeout(() => {
          (window as any).electronAPI?.restartApp();
        }, 2000);
      }
    } catch (error) {
      console.error('Restore error:', error);
      setBackupStatus({
        type: 'error',
        message: 'Failed to restore backup. Please check your password.',
      });
    } finally {
      setIsRestoring(false);
      setRestorePassword('');
      setSelectedBackup(null);
    }
  }, [selectedBackup, restorePassword]);

  const handleScheduleChange = useCallback(
    (frequency: BackupSchedule['frequency']) => {
      setBackupSchedule({ ...backupSchedule, frequency });

      // Update schedule in electron
      (window as any).electronAPI?.updateBackupSchedule({
        frequency,
        time: backupSchedule.time,
      });
    },
    [backupSchedule]
  );

  const formatFileSize = (bytes: number): string => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Backup Status Alert */}
      {backupStatus.type && (
        <Alert
          className={
            backupStatus.type === 'error'
              ? 'border-red-500'
              : backupStatus.type === 'warning'
              ? 'border-yellow-500'
              : 'border-green-500'
          }
        >
          {backupStatus.type === 'error' ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <CheckCircle className="h-4 w-4" />
          )}
          <AlertTitle>
            {backupStatus.type === 'error'
              ? 'Error'
              : backupStatus.type === 'warning'
              ? 'Warning'
              : 'Success'}
          </AlertTitle>
          <AlertDescription>{backupStatus.message}</AlertDescription>
        </Alert>
      )}

      {/* Manual Backup Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Data Backup & Recovery
          </CardTitle>
          <CardDescription>
            Create encrypted backups of your data and settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">Manual Backup</p>
              <p className="text-sm text-muted-foreground">
                Create an encrypted backup of all your data
              </p>
            </div>
            <Button
              onClick={handleBackup}
              disabled={isBackingUp || isRestoring}
              className="min-w-[120px]"
            >
              {isBackingUp ? (
                <>Creating...</>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Backup Now
                </>
              )}
            </Button>
          </div>

          {isBackingUp && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Creating backup...</span>
                <span>{backupProgress}%</span>
              </div>
              <Progress value={backupProgress} className="h-2" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scheduled Backups */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Scheduled Backups
          </CardTitle>
          <CardDescription>
            Automatically backup your data at regular intervals
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="frequency">Backup Frequency</Label>
              <Select
                value={backupSchedule.frequency}
                onValueChange={(value) =>
                  handleScheduleChange(value as BackupSchedule['frequency'])
                }
              >
                <SelectTrigger id="frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual Only</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="time">Backup Time</Label>
              <Input
                id="time"
                type="time"
                value={backupSchedule.time}
                onChange={(e) =>
                  setBackupSchedule({
                    ...backupSchedule,
                    time: e.target.value,
                  })
                }
                disabled={backupSchedule.frequency === 'manual'}
              />
            </div>
          </div>

          {backupSchedule.frequency !== 'manual' && (
            <div className="rounded-lg bg-muted p-3">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4" />
                <span>
                  Next backup scheduled for:{' '}
                  <strong>
                    {backupSchedule.frequency === 'daily'
                      ? `Today at ${backupSchedule.time}`
                      : backupSchedule.frequency === 'weekly'
                      ? `Sunday at ${backupSchedule.time}`
                      : `1st of next month at ${backupSchedule.time}`}
                  </strong>
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Backups */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Recent Backups
          </CardTitle>
          <CardDescription>
            Restore from a previous backup
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentBackups.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No backups available
              </p>
            ) : (
              recentBackups.map((backup, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <FileArchive className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{backup.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(backup.size)} •{' '}
                        {formatDate(backup.createdAt)}
                        {backup.encrypted && (
                          <>
                            {' '}
                            • <Key className="inline h-3 w-3" /> Encrypted
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRestore(backup)}
                    disabled={isRestoring || isBackingUp}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Restore
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Password Dialog for Backup */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Encrypt Backup</DialogTitle>
            <DialogDescription>
              Enter a password to encrypt your backup. You'll need this
              password to restore the backup later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="backup-password">Password</Label>
              <Input
                id="backup-password"
                type="password"
                placeholder="Enter encryption password"
                value={backupPassword}
                onChange={(e) => setBackupPassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowPasswordDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={performBackup}
              disabled={!backupPassword || backupPassword.length < 8}
            >
              Create Encrypted Backup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Dialog for Restore */}
      <Dialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore Backup</DialogTitle>
            <DialogDescription>
              Enter the password used to encrypt this backup. This will replace
              all current data.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Warning</AlertTitle>
              <AlertDescription>
                Restoring a backup will replace all current data. This action
                cannot be undone.
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label htmlFor="restore-password">Backup Password</Label>
              <Input
                id="restore-password"
                type="password"
                placeholder="Enter backup password"
                value={restorePassword}
                onChange={(e) => setRestorePassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRestoreDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={performRestore}
              disabled={!restorePassword}
            >
              Restore Backup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BackupRestoreManager;