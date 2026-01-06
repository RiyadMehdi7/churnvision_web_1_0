import { render, screen, fireEvent } from '@testing-library/react';
import { TrainingReminderBanner } from './TrainingReminderBanner';
import { useGlobalDataCache } from '../../hooks/useGlobalDataCache';
import { useProject } from '../../contexts/ProjectContext';
import { useNavigate } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';

// Mock the hooks
vi.mock('../../hooks/useGlobalDataCache', () => ({
  useGlobalDataCache: vi.fn(),
}));
vi.mock('../../contexts/ProjectContext', () => ({
  useProject: vi.fn(),
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: vi.fn(),
  };
});

describe('TrainingReminderBanner', () => {
  it('does not render when model is trained', () => {
    (useProject as any).mockReturnValue({ activeProject: { dbPath: 'test' } });
    (useGlobalDataCache as any).mockImplementation((selector: any) =>
      selector({ trainingStatus: { status: 'complete' } })
    );
    const { container } = render(<TrainingReminderBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders when model is not trained', () => {
    (useProject as any).mockReturnValue({ activeProject: { dbPath: 'test' } });
    (useGlobalDataCache as any).mockImplementation((selector: any) =>
      selector({ trainingStatus: { status: 'idle' } })
    );
    render(<TrainingReminderBanner />);
    expect(screen.getByText('Training required')).toBeInTheDocument();
    expect(screen.getByText('Train model')).toBeInTheDocument();
  });

  it('renders error message on training failure', () => {
    (useProject as any).mockReturnValue({ activeProject: { dbPath: 'test' } });
    (useGlobalDataCache as any).mockImplementation((selector: any) =>
      selector({ trainingStatus: { status: 'error', error: 'Training failed' } })
    );
    render(<TrainingReminderBanner />);
    expect(screen.getByText('Training required')).toBeInTheDocument();
    expect(screen.getByText(/Training failed/i)).toBeInTheDocument();
    expect(screen.getByText('Retry training')).toBeInTheDocument();
  });

  it('navigates to data management on button click', () => {
    const navigate = vi.fn();
    (useNavigate as any).mockReturnValue(navigate);
    (useProject as any).mockReturnValue({ activeProject: { dbPath: 'test' } });
    (useGlobalDataCache as any).mockImplementation((selector: any) =>
      selector({ trainingStatus: { status: 'idle' } })
    );
    render(<TrainingReminderBanner />);
    fireEvent.click(screen.getByText('Train model'));
    expect(navigate).toHaveBeenCalledWith('/data-management');
  });
});
