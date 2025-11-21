import React, { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Download, AlertCircle, CheckCircle } from 'lucide-react';

// Define the structure for progress updates from preload
interface DownloadProgress {
  percent: number;
  transferredBytes: number;
  totalBytes: number;
}

export const ModelDownloadPrompt: React.FC = () => {
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [totalSizeMB, setTotalSizeMB] = useState<number>(0);
  const [downloadedMB, setDownloadedMB] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(false);

  const llmApi = (window as any)?.electronApi?.llm; // Access the exposed API

  // Effect to listen for download progress and completion
  useEffect(() => {
    if (!llmApi) {
      console.error('ModelDownloadPrompt: LLM API not available via preload.');
      setError('Application integration error. Cannot manage model download.');
      return;
    }

    const handleProgress = (progress: DownloadProgress) => {
      console.log('Download Progress:', progress);
      const totalMB = progress.totalBytes / (1024 * 1024);
      const currentMB = progress.transferredBytes / (1024 * 1024);
      setDownloadProgress(progress.percent);
      setTotalSizeMB(totalMB);
      setDownloadedMB(currentMB);

      // Note: Removed automatic retry on 100% - now handled by download complete event
    };

    const handleDownloadComplete = () => {
      console.log('Download complete event received. Starting initialization process...');
      setIsDownloading(false);
      setIsCompleted(true);
      setIsInitializing(true);
      setError(null);

      // Add a delay to ensure file system operations are complete before initialization
      setTimeout(() => {
        console.log('Triggering LLM initialization after download completion...');
        llmApi.retryInitialization()
          .then(() => {
            console.log('LLM initialization successful after download.');
            setIsInitializing(false);
          })
          .catch((retryError: any) => {
            console.error('Failed to initialize LLM after download:', retryError);
            setError(`Download complete, but failed to initialize model: ${retryError.message}`);
            setIsInitializing(false);
          });
      }, 3000); // 3-second delay to ensure file is fully written and available
    };

    console.log('ModelDownloadPrompt: Setting up download listeners...');
    const unsubscribeProgress = llmApi.onDownloadProgress(handleProgress);
    const unsubscribeComplete = llmApi.onDownloadComplete(handleDownloadComplete);

    return () => {
      console.log('ModelDownloadPrompt: Cleaning up download listeners.');
      unsubscribeProgress();
      unsubscribeComplete();
    };
  }, [llmApi]);

  const handleDownloadClick = useCallback(async () => {
    if (!llmApi) {
      setError('Application integration error. Cannot start download.');
      return;
    }
    setIsDownloading(true);
    setIsCompleted(false);
    setError(null);
    setDownloadProgress(0);
    setDownloadedMB(0);
    setTotalSizeMB(0);

    try {
      console.log('ModelDownloadPrompt: Initiating model download via IPC...');
      await llmApi.startModelDownload();
      // Main process will start sending progress via the listener
    } catch (downloadError: any) {
      console.error('ModelDownloadPrompt: Failed to start download:', downloadError);
      setError(downloadError.message || 'Failed to initiate download.');
      setIsDownloading(false);
    }
  }, [llmApi]);

  const handleRetryInitialization = useCallback(async () => {
    if (!llmApi) {
      setError('Application integration error. Cannot retry initialization.');
      return;
    }

    setIsInitializing(true);
    setError(null);

    try {
      console.log('ModelDownloadPrompt: Manual retry of LLM initialization...');
      await llmApi.retryInitialization();
      console.log('Manual LLM initialization successful.');
      setIsInitializing(false);
    } catch (retryError: any) {
      console.error('Manual LLM initialization failed:', retryError);
      setError(`Failed to initialize model: ${retryError.message}`);
      setIsInitializing(false);
    }
  }, [llmApi]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 p-8 rounded-lg shadow-xl max-w-md w-full mx-4 border border-gray-200 dark:border-gray-700">
        <div className="flex flex-col items-center text-center">
          <Download className="w-16 h-16 text-app-green mb-4" />
          <h2 className="text-2xl font-semibold mb-3 text-gray-800 dark:text-gray-100">AI Model Required</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            To enable the AI Assistant features, a language model needs to be downloaded.
            The file size is approximately 4.4 GB. Please ensure you have a stable internet connection.
          </p>

          {error && (
            <div role="alert" className="mb-4 text-left w-full p-4 rounded-md border bg-destructive/10 border-destructive text-destructive">
              <AlertCircle className="h-4 w-4 inline-block mr-2" />
              <strong className="font-semibold">Download Error</strong>
              <div className="text-sm mt-1">{error}</div>
            </div>
          )}

          {isCompleted && !error && (
             <div role="alert" className="mb-4 text-left w-full p-4 rounded-md border bg-green-100 dark:bg-green-900/20 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300">
               <CheckCircle className="h-4 w-4 inline-block mr-2" />
               <strong className="font-semibold">Download Complete</strong>
               <div className="text-sm mt-1">
                 {isInitializing ? 'Initializing AI service...' : 'AI service ready!'}
               </div>
             </div>
          )}

          {!isDownloading && !isCompleted && (
            <Button
              onClick={handleDownloadClick}
              size="lg"
              className="w-full bg-app-green hover:bg-app-green/90 text-white"
            >
              Download Model (~4.4 GB)
            </Button>
          )}

          {isCompleted && error && !isInitializing && (
            <Button
              onClick={handleRetryInitialization}
              size="lg"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              Retry Initialization
            </Button>
          )}

          {(isDownloading || isInitializing) && (
            <div className="w-full mt-4 space-y-2">
               <Progress value={isInitializing ? 100 : downloadProgress} className="w-full h-3" />
               <p className="text-sm text-gray-500 dark:text-gray-400">
                 {isInitializing ? (
                   'Initializing AI model...'
                 ) : (
                   <>
                     Downloading... {downloadProgress}%
                     {totalSizeMB > 0 && ` (${downloadedMB.toFixed(1)} MB / ${totalSizeMB.toFixed(1)} MB)`}
                   </>
                 )}
               </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}; 