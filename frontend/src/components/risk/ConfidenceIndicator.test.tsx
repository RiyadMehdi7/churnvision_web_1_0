import { render, screen } from '@testing-library/react';
import { ConfidenceIndicator } from './ConfidenceIndicator';
import { describe, it, expect } from 'vitest';

describe('ConfidenceIndicator', () => {
  it('renders the confidence score correctly', () => {
    render(<ConfidenceIndicator confidenceScore={85} />);
    expect(screen.getByText('85% confidence')).toBeInTheDocument();
  });

  it('displays a green dot for high confidence', () => {
    const { container } = render(<ConfidenceIndicator confidenceScore={85} />);
    const dot = container.querySelector('.w-3.h-3');
    expect(dot).toHaveClass('bg-green-500');
  });

  it('displays a blue dot for medium-high confidence', () => {
    const { container } = render(<ConfidenceIndicator confidenceScore={75} />);
    const dot = container.querySelector('.w-3.h-3');
    expect(dot).toHaveClass('bg-blue-500');
  });

  it('displays a yellow dot for medium-low confidence', () => {
    const { container } = render(<ConfidenceIndicator confidenceScore={55} />);
    const dot = container.querySelector('.w-3.h-3');
    expect(dot).toHaveClass('bg-yellow-500');
  });

  it('displays a red dot for low confidence', () => {
    const { container } = render(<ConfidenceIndicator confidenceScore={35} />);
    const dot = container.querySelector('.w-3.h-3');
    expect(dot).toHaveClass('bg-red-500');
  });

  it('renders the uncertainty range when provided', () => {
    render(<ConfidenceIndicator confidenceScore={75} uncertaintyRange={[0.7, 0.8]} />);
    expect(screen.getByText('Range: 70.0% - 80.0%')).toBeInTheDocument();
  });

  it('does not render the uncertainty range when not provided', () => {
    render(<ConfidenceIndicator confidenceScore={75} />);
    expect(screen.queryByText(/Range:/)).not.toBeInTheDocument();
  });
});
