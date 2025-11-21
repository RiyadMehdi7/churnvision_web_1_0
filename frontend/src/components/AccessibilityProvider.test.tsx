import { render, screen, fireEvent } from '@testing-library/react';
import { AccessibilityProvider, useAccessibility } from './AccessibilityProvider';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';

const TestComponent = () => {
  const { isFocusVisible, announceToScreenReader } = useAccessibility();
  return (
    <div>
      <div data-testid="focus-visible">{isFocusVisible.toString()}</div>
      <button onClick={() => announceToScreenReader('Test Announcement')}>Announce</button>
    </div>
  );
};

describe('AccessibilityProvider', () => {
  it('sets focus visible on Tab key press', () => {
    render(
      <AccessibilityProvider>
        <TestComponent />
      </AccessibilityProvider>
    );
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(screen.getByTestId('focus-visible')).toHaveTextContent('true');
  });

  it('sets focus not visible on mouse down', () => {
    render(
      <AccessibilityProvider>
        <TestComponent />
      </AccessibilityProvider>
    );
    fireEvent.keyDown(window, { key: 'Tab' });
    fireEvent.mouseDown(window);
    expect(screen.getByTestId('focus-visible')).toHaveTextContent('false');
  });

  it('announces to screen reader', () => {
    render(
      <AccessibilityProvider>
        <TestComponent />
      </AccessibilityProvider>
    );
    fireEvent.click(screen.getByText('Announce'));
    const announcer = document.getElementById('a11y-announcer');
    expect(announcer).toHaveTextContent('Test Announcement');
  });

  it('throws error if useAccessibility is used outside of provider', () => {
    // Prevent the error from being logged to the console
    const spy = vi.spyOn(console, 'error');
    spy.mockImplementation(() => {});

    expect(() => render(<TestComponent />)).toThrow(
      'useAccessibility must be used within an AccessibilityProvider'
    );

    spy.mockRestore();
  });
});
