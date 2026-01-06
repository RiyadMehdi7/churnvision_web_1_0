import { render, screen, fireEvent, act } from '@testing-library/react';
import { DataUploadNotification } from './DataUploadNotification';
import { describe, it, expect, vi } from 'vitest';

describe('DataUploadNotification', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the notification when show is true', () => {
    render(<DataUploadNotification show={true} message="Test Message" onClose={() => {}} />);
    expect(screen.getByText('Test Message')).toBeInTheDocument();
  });

  it('does not render the notification when show is false', () => {
    const { container } = render(<DataUploadNotification show={false} message="Test Message" onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('displays the correct message', () => {
    render(<DataUploadNotification show={true} message="Another Test Message" onClose={() => {}} />);
    expect(screen.getByText('Another Test Message')).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<DataUploadNotification show={true} message="Test Message" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose automatically after a timeout', () => {
    const onClose = vi.fn();
    render(<DataUploadNotification show={true} message="Test Message" onClose={onClose} />);
    
    act(() => {
      vi.advanceTimersByTime(30000);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
