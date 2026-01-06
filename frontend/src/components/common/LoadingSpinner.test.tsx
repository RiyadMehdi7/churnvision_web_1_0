import { render, screen } from '@testing-library/react';
import { LoadingSpinner, LoadingStates } from '@/components/common/LoadingSpinner';
import { describe, it, expect } from 'vitest';

describe('LoadingSpinner', () => {
  it('renders the default spinner variant', () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders the dots variant', () => {
    const { container } = render(<LoadingSpinner variant="dots" />);
    expect(container.querySelectorAll('.flex.space-x-1\\.5 > div').length).toBe(3);
  });

  it('renders the pulse variant', () => {
    const { container } = render(<LoadingSpinner variant="pulse" />);
    expect(container.querySelectorAll('.rounded-full').length).toBeGreaterThanOrEqual(2);
  });

  it('renders the bars variant', () => {
    const { container } = render(<LoadingSpinner variant="bars" />);
    expect(container.querySelectorAll('.w-1.rounded-full').length).toBe(5);
  });

  it('renders with small size', () => {
    const { container } = render(<LoadingSpinner size="sm" />);
    expect(container.querySelector('.w-4.h-4')).toBeInTheDocument();
  });

  it('renders with large size', () => {
    const { container } = render(<LoadingSpinner size="lg" />);
    expect(container.querySelector('.w-6.h-6')).toBeInTheDocument();
  });

  it('renders with primary color', () => {
    const { container } = render(<LoadingSpinner color="primary" />);
    expect(container.querySelector('.text-emerald-500')).toBeInTheDocument();
  });

  it('renders with white color', () => {
    const { container } = render(<LoadingSpinner color="white" />);
    expect(container.firstChild).toHaveClass('text-white');
  });

  it('renders with text', () => {
    render(<LoadingSpinner text="Loading..." />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});

describe('LoadingStates', () => {
  it('renders ButtonLoading', () => {
    render(<LoadingStates.ButtonLoading />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders PageLoading', () => {
    render(<LoadingStates.PageLoading />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders InlineLoading', () => {
    render(<LoadingStates.InlineLoading text="Loading inline" />);
    expect(screen.getByText('Loading inline')).toBeInTheDocument();
  });

  it('renders CardLoading', () => {
    render(<LoadingStates.CardLoading />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders TableLoading', () => {
    const { container } = render(<LoadingStates.TableLoading />);
    expect(container.querySelector('[class*="shimmer_2s_infinite"]')).toBeInTheDocument();
  });

  it('renders OverlayLoading', () => {
    render(<LoadingStates.OverlayLoading />);
    expect(screen.getByText('Processing...')).toBeInTheDocument();
  });
});
