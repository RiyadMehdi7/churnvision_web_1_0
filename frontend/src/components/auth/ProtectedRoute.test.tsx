import { render, screen } from '@testing-library/react';
import { ProtectedRoute } from './ProtectedRoute';
import { useLicense } from '../../providers/LicenseProvider';
import { describe, it, expect, vi } from 'vitest';

// Mock the useLicense hook
vi.mock('../../providers/LicenseProvider', () => ({
  useLicense: vi.fn(),
  getLicenseTierDisplayName: (tier: string) => tier,
}));

describe('ProtectedRoute', () => {
  it('renders children when user has access', () => {
    (useLicense as any).mockReturnValue({
      hasAccess: () => true,
      licenseTier: 'Enterprise',
    });

    render(
      <ProtectedRoute feature="ai-assistant">
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('renders upgrade prompt when user does not have access', () => {
    (useLicense as any).mockReturnValue({
      hasAccess: () => false,
      licenseTier: 'Basic',
    });

    render(
      <ProtectedRoute feature="ai-assistant">
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('AI Assistant Access Required')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('displays correct feature info for "ai-assistant"', () => {
    (useLicense as any).mockReturnValue({
      hasAccess: () => false,
      licenseTier: 'Basic',
    });

    render(<ProtectedRoute feature="ai-assistant"><div>child</div></ProtectedRoute>);

    expect(screen.getByText('AI Assistant')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Upgrade to Advanced/i })).toBeInTheDocument();
  });

  it('displays correct feature info for "playground"', () => {
    (useLicense as any).mockReturnValue({
      hasAccess: () => false,
      licenseTier: 'Advanced',
    });

    render(<ProtectedRoute feature="playground"><div>child</div></ProtectedRoute>);

    expect(screen.getByText('Playground')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Upgrade to Enterprise/i })).toBeInTheDocument();
  });
});
