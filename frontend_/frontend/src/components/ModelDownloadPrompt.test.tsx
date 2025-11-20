import { render, screen, fireEvent, act } from '@testing-library/react';
import { ModelDownloadPrompt } from './ModelDownloadPrompt';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the electronApi
const mockElectronApi = {
  llm: {
    startModelDownload: vi.fn(),
    retryInitialization: vi.fn(),
    onDownloadProgress: vi.fn((callback: (progress: any) => void) => {
      // Store the callback to be called later
      (window as any).progressCallback = callback;
      return () => {}; // Return an unsubscribe function
    }),
    onDownloadComplete: vi.fn((callback: () => void) => {
      // Store the callback to be called later
      (window as any).completeCallback = callback;
      return () => {}; // Return an unsubscribe function
    }),
  },
};

(window as any).electronApi = mockElectronApi;

describe('ModelDownloadPrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the initial prompt correctly', () => {
    render(<ModelDownloadPrompt />);
    expect(screen.getByText('AI Model Required')).toBeInTheDocument();
    expect(screen.getByText('Download Model (~4.4 GB)')).toBeInTheDocument();
  });

  it('starts the download on button click', () => {
    render(<ModelDownloadPrompt />);
    fireEvent.click(screen.getByText('Download Model (~4.4 GB)'));
    expect(mockElectronApi.llm.startModelDownload).toHaveBeenCalledTimes(1);
  });

  it('displays download progress', () => {
    render(<ModelDownloadPrompt />);
    fireEvent.click(screen.getByText('Download Model (~4.4 GB)'));

    act(() => {
      (window as any).progressCallback({ percent: 50, transferredBytes: 2200000000, totalBytes: 4400000000 });
    });

    expect(screen.getByText(/Downloading... 50%/)).toBeInTheDocument();
    expect(screen.getByText(/2098.1/)).toBeInTheDocument();
    expect(screen.getByText(/4196.2/)).toBeInTheDocument();
  });

  it('displays completion message on download complete', async () => {
    render(<ModelDownloadPrompt />);
    fireEvent.click(screen.getByText('Download Model (~4.4 GB)'));

    await act(async () => {
      (window as any).completeCallback();
    });

    expect(screen.getByText('Download Complete')).toBeInTheDocument();
  });

  it('displays an error message on download failure', async () => {
    mockElectronApi.llm.startModelDownload.mockRejectedValue(new Error('Download Failed'));
    render(<ModelDownloadPrompt />);
    fireEvent.click(screen.getByText('Download Model (~4.4 GB)'));
    expect(await screen.findByText('Download Error')).toBeInTheDocument();
    expect(await screen.findByText('Download Failed')).toBeInTheDocument();
  });

  it('retries initialization on button click', async () => {
    // First, complete the download with an error
    mockElectronApi.llm.retryInitialization.mockRejectedValue(new Error('Initialization Failed'));
    render(<ModelDownloadPrompt />);
    fireEvent.click(screen.getByText('Download Model (~4.4 GB)'));
    await act(async () => {
      (window as any).completeCallback();
    });

    // Now, click the retry button
    const retryButton = await screen.findByText('Retry Initialization');
    fireEvent.click(retryButton);
    expect(mockElectronApi.llm.retryInitialization).toHaveBeenCalledTimes(1);
  });
});
