import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';
import { describe, it, expect, vi } from 'vitest';

// A component that throws an error
const ProblemChild = () => {
  throw new Error('Test Error');
};

describe('ErrorBoundary', () => {
  // Suppress console.error output from jsdom
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>Child Component</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('Child Component')).toBeInTheDocument();
  });

  it('displays fallback UI on error', () => {
    render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>
    );
    expect(screen.getByText('Component Error')).toBeInTheDocument();
    expect(screen.getByText('Test Error')).toBeInTheDocument();
  });

  it('calls onError prop on error', () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError}>
        <ProblemChild />
      </ErrorBoundary>
    );
    expect(onError).toHaveBeenCalledWith(expect.any(Error), expect.any(Object));
  });

  it('retries rendering on button click', () => {
    render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>
    );
    expect(screen.getByText('Component Error')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Retry'));
    // Since ProblemChild will throw again, we expect the error boundary to be shown again.
    // A more complex test could involve a child that only throws once.
    expect(screen.getByText('Component Error')).toBeInTheDocument();
  });

  it('renders page level error', () => {
    render(
      <ErrorBoundary level="page">
        <ProblemChild />
      </ErrorBoundary>
    );
    expect(screen.getByText('Page Error')).toBeInTheDocument();
  });

  it('renders critical level error', () => {
    render(
      <ErrorBoundary level="critical">
        <ProblemChild />
      </ErrorBoundary>
    );
    expect(screen.getByText('Critical Application Error')).toBeInTheDocument();
  });

  it('renders custom fallback component', () => {
    render(
      <ErrorBoundary fallback={<div>Custom Fallback</div>}>
        <ProblemChild />
      </ErrorBoundary>
    );
    expect(screen.getByText('Custom Fallback')).toBeInTheDocument();
  });
});
