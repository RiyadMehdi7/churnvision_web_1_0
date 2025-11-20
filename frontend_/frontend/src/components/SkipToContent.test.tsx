import { render, screen } from '@testing-library/react';
import { SkipToContent } from './SkipToContent';
import { describe, it, expect } from 'vitest';

describe('SkipToContent', () => {
  it('renders a link with the correct text', () => {
    render(<SkipToContent />);
    expect(screen.getByText('Skip to main content')).toBeInTheDocument();
  });

  it('has the correct href attribute', () => {
    render(<SkipToContent />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '#main-content');
  });
});
