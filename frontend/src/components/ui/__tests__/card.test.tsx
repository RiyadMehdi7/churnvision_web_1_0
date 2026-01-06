import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../card';

describe('Card', () => {
  describe('Card component', () => {
    it('renders correctly', () => {
      render(<Card data-testid="card">Card content</Card>);
      const card = screen.getByTestId('card');
      expect(card).toBeInTheDocument();
      expect(card).toHaveTextContent('Card content');
    });

    it('applies default styles', () => {
      render(<Card data-testid="card">Content</Card>);
      const card = screen.getByTestId('card');
      expect(card).toHaveClass('rounded-xl');
      expect(card).toHaveClass('border');
      expect(card).toHaveClass('bg-card');
      expect(card).toHaveClass('shadow-sm');  // default variant uses shadow-sm
    });

    it('accepts custom className', () => {
      render(<Card data-testid="card" className="custom-class">Content</Card>);
      const card = screen.getByTestId('card');
      expect(card).toHaveClass('custom-class');
    });

    it('forwards ref correctly', () => {
      const ref = vi.fn();
      render(<Card ref={ref}>Content</Card>);
      expect(ref).toHaveBeenCalled();
      expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLDivElement);
    });

    it('renders as div element', () => {
      render(<Card data-testid="card">Content</Card>);
      const card = screen.getByTestId('card');
      expect(card.tagName).toBe('DIV');
    });

    it('passes through HTML attributes', () => {
      render(<Card data-testid="card" id="my-card" role="region">Content</Card>);
      const card = screen.getByTestId('card');
      expect(card).toHaveAttribute('id', 'my-card');
      expect(card).toHaveAttribute('role', 'region');
    });
  });

  describe('CardHeader component', () => {
    it('renders correctly', () => {
      render(<CardHeader data-testid="header">Header content</CardHeader>);
      const header = screen.getByTestId('header');
      expect(header).toBeInTheDocument();
      expect(header).toHaveTextContent('Header content');
    });

    it('applies default styles', () => {
      render(<CardHeader data-testid="header">Content</CardHeader>);
      const header = screen.getByTestId('header');
      expect(header).toHaveClass('flex');
      expect(header).toHaveClass('flex-col');
      expect(header).toHaveClass('space-y-1.5');
      expect(header).toHaveClass('p-6');
    });

    it('accepts custom className', () => {
      render(<CardHeader data-testid="header" className="custom-header">Content</CardHeader>);
      const header = screen.getByTestId('header');
      expect(header).toHaveClass('custom-header');
    });

    it('forwards ref correctly', () => {
      const ref = vi.fn();
      render(<CardHeader ref={ref}>Content</CardHeader>);
      expect(ref).toHaveBeenCalled();
      expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe('CardTitle component', () => {
    it('renders correctly', () => {
      render(<CardTitle data-testid="title">Title text</CardTitle>);
      const title = screen.getByTestId('title');
      expect(title).toBeInTheDocument();
      expect(title).toHaveTextContent('Title text');
    });

    it('applies default styles', () => {
      render(<CardTitle data-testid="title">Title</CardTitle>);
      const title = screen.getByTestId('title');
      expect(title).toHaveClass('font-semibold');
      expect(title).toHaveClass('leading-none');
      expect(title).toHaveClass('tracking-tight');
    });

    it('accepts custom className', () => {
      render(<CardTitle data-testid="title" className="text-2xl">Title</CardTitle>);
      const title = screen.getByTestId('title');
      expect(title).toHaveClass('text-2xl');
    });

    it('forwards ref correctly', () => {
      const ref = vi.fn();
      render(<CardTitle ref={ref}>Title</CardTitle>);
      expect(ref).toHaveBeenCalled();
      expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe('CardDescription component', () => {
    it('renders correctly', () => {
      render(<CardDescription data-testid="desc">Description text</CardDescription>);
      const desc = screen.getByTestId('desc');
      expect(desc).toBeInTheDocument();
      expect(desc).toHaveTextContent('Description text');
    });

    it('applies default styles', () => {
      render(<CardDescription data-testid="desc">Description</CardDescription>);
      const desc = screen.getByTestId('desc');
      expect(desc).toHaveClass('text-sm');
      expect(desc).toHaveClass('text-muted-foreground');
    });

    it('accepts custom className', () => {
      render(<CardDescription data-testid="desc" className="italic">Description</CardDescription>);
      const desc = screen.getByTestId('desc');
      expect(desc).toHaveClass('italic');
    });

    it('forwards ref correctly', () => {
      const ref = vi.fn();
      render(<CardDescription ref={ref}>Description</CardDescription>);
      expect(ref).toHaveBeenCalled();
      expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe('CardContent component', () => {
    it('renders correctly', () => {
      render(<CardContent data-testid="content">Main content</CardContent>);
      const content = screen.getByTestId('content');
      expect(content).toBeInTheDocument();
      expect(content).toHaveTextContent('Main content');
    });

    it('applies default styles', () => {
      render(<CardContent data-testid="content">Content</CardContent>);
      const content = screen.getByTestId('content');
      expect(content).toHaveClass('p-6');
      expect(content).toHaveClass('pt-0');
    });

    it('accepts custom className', () => {
      render(<CardContent data-testid="content" className="bg-gray-100">Content</CardContent>);
      const content = screen.getByTestId('content');
      expect(content).toHaveClass('bg-gray-100');
    });

    it('forwards ref correctly', () => {
      const ref = vi.fn();
      render(<CardContent ref={ref}>Content</CardContent>);
      expect(ref).toHaveBeenCalled();
      expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe('CardFooter component', () => {
    it('renders correctly', () => {
      render(<CardFooter data-testid="footer">Footer content</CardFooter>);
      const footer = screen.getByTestId('footer');
      expect(footer).toBeInTheDocument();
      expect(footer).toHaveTextContent('Footer content');
    });

    it('applies default styles', () => {
      render(<CardFooter data-testid="footer">Footer</CardFooter>);
      const footer = screen.getByTestId('footer');
      expect(footer).toHaveClass('flex');
      expect(footer).toHaveClass('items-center');
      expect(footer).toHaveClass('p-6');
      expect(footer).toHaveClass('pt-0');
    });

    it('accepts custom className', () => {
      render(<CardFooter data-testid="footer" className="justify-end">Footer</CardFooter>);
      const footer = screen.getByTestId('footer');
      expect(footer).toHaveClass('justify-end');
    });

    it('forwards ref correctly', () => {
      const ref = vi.fn();
      render(<CardFooter ref={ref}>Footer</CardFooter>);
      expect(ref).toHaveBeenCalled();
      expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe('Complete Card composition', () => {
    it('renders all card parts together', () => {
      render(
        <Card data-testid="card">
          <CardHeader data-testid="header">
            <CardTitle data-testid="title">Card Title</CardTitle>
            <CardDescription data-testid="desc">Card description</CardDescription>
          </CardHeader>
          <CardContent data-testid="content">
            <p>Card content goes here</p>
          </CardContent>
          <CardFooter data-testid="footer">
            <button>Action</button>
          </CardFooter>
        </Card>
      );

      expect(screen.getByTestId('card')).toBeInTheDocument();
      expect(screen.getByTestId('header')).toBeInTheDocument();
      expect(screen.getByTestId('title')).toHaveTextContent('Card Title');
      expect(screen.getByTestId('desc')).toHaveTextContent('Card description');
      expect(screen.getByTestId('content')).toHaveTextContent('Card content goes here');
      expect(screen.getByTestId('footer')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /action/i })).toBeInTheDocument();
    });

    it('maintains proper nesting structure', () => {
      render(
        <Card data-testid="card">
          <CardHeader data-testid="header">
            <CardTitle>Title</CardTitle>
          </CardHeader>
          <CardContent data-testid="content">Content</CardContent>
        </Card>
      );

      const card = screen.getByTestId('card');
      const header = screen.getByTestId('header');
      const content = screen.getByTestId('content');

      expect(card).toContainElement(header);
      expect(card).toContainElement(content);
    });
  });
});
