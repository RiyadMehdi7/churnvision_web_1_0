import React, { createContext, useContext, useEffect, useState } from 'react';

interface AccessibilityContextType {
  isFocusVisible: boolean;
  setFocusVisible: (visible: boolean) => void;
  announceToScreenReader: (message: string) => void;
}

const AccessibilityContext = createContext<AccessibilityContextType | undefined>(undefined);

interface AccessibilityProviderProps {
  children: React.ReactNode;
}

export function AccessibilityProvider({ children }: AccessibilityProviderProps): React.ReactElement {
  const [isFocusVisible, setFocusVisible] = useState(false);
  
  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        setFocusVisible(true);
      }
    };
    
    const handleMouseDown = () => {
      setFocusVisible(false);
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handleMouseDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);
  
  // Add focus styles to the document
  useEffect(() => {
    const style = document.createElement('style');
    // SECURITY FIX: Replace innerHTML with textContent for CSS
    style.textContent = `
      .js-focus-visible :focus:not(.focus-visible) {
        outline: none;
      }
      
      .js-focus-visible .focus-visible {
        outline: 2px solid #75caa9;
        outline-offset: 2px;
      }
    `;
    document.head.appendChild(style);
    
    document.documentElement.classList.add('js-focus-visible');
    
    return () => {
      document.head.removeChild(style);
      document.documentElement.classList.remove('js-focus-visible');
    };
  }, []);
  
  // Screen reader announcements
  const announceToScreenReader = (message: string) => {
    const announcer = document.getElementById('a11y-announcer');
    
    if (announcer) {
      announcer.textContent = message;
    } else {
      const newAnnouncer = document.createElement('div');
      newAnnouncer.id = 'a11y-announcer';
      newAnnouncer.setAttribute('aria-live', 'polite');
      newAnnouncer.setAttribute('aria-atomic', 'true');
      newAnnouncer.className = 'sr-only';
      newAnnouncer.textContent = message;
      
      document.body.appendChild(newAnnouncer);
    }
  };
  
  return (
    <AccessibilityContext.Provider
      value={{
        isFocusVisible,
        setFocusVisible,
        announceToScreenReader
      }}
    >
      {children}
      <div id="a11y-announcer" className="sr-only" aria-live="polite" aria-atomic="true" />
    </AccessibilityContext.Provider>
  );
}

export const useAccessibility = (): AccessibilityContextType => {
  const context = useContext(AccessibilityContext);
  
  if (context === undefined) {
    throw new Error('useAccessibility must be used within an AccessibilityProvider');
  }
  
  return context;
}; 