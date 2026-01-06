import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PageHeader } from '../PageHeader';
import { Home, Settings, Users } from 'lucide-react';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
    h1: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <h1 {...props}>{children}</h1>,
    p: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <p {...props}>{children}</p>,
    span: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <span {...props}>{children}</span>,
  },
}));

describe('PageHeader', () => {
  describe('basic rendering', () => {
    it('renders title correctly', () => {
      render(<PageHeader title="Dashboard" />);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Dashboard');
    });

    it('renders as header element', () => {
      render(<PageHeader title="Test" />);
      expect(screen.getByRole('banner')).toBeInTheDocument();
    });
  });

  describe('subtitle', () => {
    it('renders subtitle when provided', () => {
      render(<PageHeader title="Dashboard" subtitle="Overview of your data" />);
      expect(screen.getByText('Overview of your data')).toBeInTheDocument();
    });

    it('does not render subtitle when not provided', () => {
      render(<PageHeader title="Dashboard" />);
      expect(screen.queryByText(/overview/i)).not.toBeInTheDocument();
    });
  });

  describe('icon', () => {
    it('renders icon when provided', () => {
      render(<PageHeader title="Home" icon={Home} />);
      // The icon should be rendered (as SVG)
      const header = screen.getByRole('banner');
      expect(header.querySelector('svg')).toBeInTheDocument();
    });

    it('does not render icon container when not provided', () => {
      const { container } = render(<PageHeader title="No Icon" />);
      // Should not have the icon wrapper with specific classes
      expect(container.querySelector('.w-10.h-10')).not.toBeInTheDocument();
    });
  });

  describe('userName and greeting', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('renders greeting with userName when provided', () => {
      vi.setSystemTime(new Date('2024-01-15T10:00:00'));
      render(<PageHeader title="Dashboard" userName="John" />);
      expect(screen.getByText(/john/i)).toBeInTheDocument();
    });

    it('shows "Good morning" before noon', () => {
      vi.setSystemTime(new Date('2024-01-15T09:00:00'));
      render(<PageHeader title="Dashboard" userName="Test" />);
      expect(screen.getByText(/good morning/i)).toBeInTheDocument();
    });

    it('shows "Good afternoon" between noon and 5pm', () => {
      vi.setSystemTime(new Date('2024-01-15T14:00:00'));
      render(<PageHeader title="Dashboard" userName="Test" />);
      expect(screen.getByText(/good afternoon/i)).toBeInTheDocument();
    });

    it('shows "Good evening" after 5pm', () => {
      vi.setSystemTime(new Date('2024-01-15T19:00:00'));
      render(<PageHeader title="Dashboard" userName="Test" />);
      expect(screen.getByText(/good evening/i)).toBeInTheDocument();
    });

    it('does not show greeting without userName', () => {
      render(<PageHeader title="Dashboard" />);
      expect(screen.queryByText(/good morning/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/good afternoon/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/good evening/i)).not.toBeInTheDocument();
    });
  });

  describe('badges', () => {
    it('renders badges when provided', () => {
      render(
        <PageHeader
          title="Dashboard"
          badges={[
            { label: 'Active', variant: 'emerald' },
            { label: 'Beta', variant: 'purple' },
          ]}
        />
      );
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Beta')).toBeInTheDocument();
    });

    it('does not render badges section when empty array', () => {
      render(<PageHeader title="Dashboard" badges={[]} />);
      // No badge labels should be present
      expect(screen.queryByText('Active')).not.toBeInTheDocument();
    });

    it('renders badge with pulse indicator when pulse is true', () => {
      const { container } = render(
        <PageHeader
          title="Dashboard"
          badges={[{ label: 'Live', variant: 'emerald', pulse: true }]}
        />
      );
      // Should have animate-ping class for pulse effect
      expect(container.querySelector('.animate-ping')).toBeInTheDocument();
    });

    it('renders all badge variants correctly', () => {
      render(
        <PageHeader
          title="Test"
          badges={[
            { label: 'Emerald', variant: 'emerald' },
            { label: 'Purple', variant: 'purple' },
            { label: 'Blue', variant: 'blue' },
            { label: 'Sky', variant: 'sky' },
            { label: 'Amber', variant: 'amber' },
          ]}
        />
      );
      expect(screen.getByText('Emerald')).toBeInTheDocument();
      expect(screen.getByText('Purple')).toBeInTheDocument();
      expect(screen.getByText('Blue')).toBeInTheDocument();
      expect(screen.getByText('Sky')).toBeInTheDocument();
      expect(screen.getByText('Amber')).toBeInTheDocument();
    });
  });

  describe('rightContent', () => {
    it('renders right content when provided', () => {
      render(
        <PageHeader
          title="Dashboard"
          rightContent={<button>Action Button</button>}
        />
      );
      expect(screen.getByRole('button', { name: /action button/i })).toBeInTheDocument();
    });

    it('does not render right section when rightContent not provided', () => {
      const { container } = render(<PageHeader title="Dashboard" />);
      // Should only have the left side content
      const flexContainer = container.querySelector('.flex.items-center.justify-between');
      expect(flexContainer?.children.length).toBe(1);
    });

    it('renders complex right content', () => {
      render(
        <PageHeader
          title="Dashboard"
          rightContent={
            <div data-testid="complex-content">
              <span>Status: Online</span>
              <button>Settings</button>
            </div>
          }
        />
      );
      expect(screen.getByTestId('complex-content')).toBeInTheDocument();
      expect(screen.getByText('Status: Online')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument();
    });
  });

  describe('complete composition', () => {
    it('renders all props together', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T10:00:00'));

      render(
        <PageHeader
          title="Employee Dashboard"
          subtitle="Manage your workforce"
          icon={Users}
          userName="Admin"
          badges={[
            { label: 'Enterprise', variant: 'purple' },
            { label: 'Active', variant: 'emerald', pulse: true },
          ]}
          rightContent={<button>Export</button>}
        />
      );

      // Title
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Employee Dashboard');

      // Subtitle
      expect(screen.getByText('Manage your workforce')).toBeInTheDocument();

      // Greeting
      expect(screen.getByText(/good morning/i)).toBeInTheDocument();
      expect(screen.getByText(/admin/i)).toBeInTheDocument();

      // Badges
      expect(screen.getByText('Enterprise')).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();

      // Right content
      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();

      vi.useRealTimers();
    });
  });

  describe('memoization', () => {
    it('has correct displayName', () => {
      expect(PageHeader.displayName).toBe('PageHeader');
    });
  });
});
