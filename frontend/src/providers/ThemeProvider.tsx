import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type Theme = 'light' | 'dark';
type ThemeSource = 'system' | 'user';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

interface ThemeState {
  theme: Theme;
  source: ThemeSource;
}

const DEFAULT_SOURCE: ThemeSource = 'system';

export function ThemeProvider({
  children,
  defaultTheme = 'light',
  storageKey = 'churnvision-theme',
}: ThemeProviderProps) {
  const sourceStorageKey = `${storageKey}-source`;

  const getInitialThemeState = useCallback((): ThemeState => {
    if (typeof window === 'undefined') {
      return { theme: defaultTheme, source: DEFAULT_SOURCE };
    }

    try {
      const storedTheme = localStorage.getItem(storageKey) as Theme | null;
      const storedSource = (localStorage.getItem(sourceStorageKey) as ThemeSource | null) ?? DEFAULT_SOURCE;

      const resolvedSource = storedSource === 'user' ? 'user' : DEFAULT_SOURCE;

      if (storedTheme === 'light' || storedTheme === 'dark') {
        if (resolvedSource === 'system' && typeof window.matchMedia === 'function') {
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          return { theme: prefersDark ? 'dark' : 'light', source: 'system' };
        }
        return { theme: storedTheme, source: resolvedSource };
      }

      if (typeof window.matchMedia === 'function') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        return { theme: prefersDark ? 'dark' : defaultTheme, source: DEFAULT_SOURCE };
      }

      return { theme: defaultTheme, source: DEFAULT_SOURCE };
    } catch (error) {
      return { theme: defaultTheme, source: DEFAULT_SOURCE };
    }
  }, [defaultTheme, sourceStorageKey, storageKey]);

  const [themeState, setThemeState] = useState<ThemeState>(() => getInitialThemeState());
  const themeStateRef = useRef(themeState);

  useEffect(() => {
    themeStateRef.current = themeState;
  }, [themeState]);

  const applyThemeToDom = useCallback((nextTheme: Theme) => {
    if (typeof document === 'undefined') {
      return;
    }

    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(nextTheme);
    root.style.colorScheme = nextTheme;
  }, []);

  useEffect(() => {
    applyThemeToDom(themeState.theme);
  }, [applyThemeToDom, themeState.theme]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      localStorage.setItem(storageKey, themeState.theme);
      localStorage.setItem(sourceStorageKey, themeState.source);
    } catch (error) {
      // Ignore storage write errors (e.g., private mode)
    }
  }, [sourceStorageKey, storageKey, themeState.source, themeState.theme]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const syncWithSystem = (matches: boolean) => {
      if (themeStateRef.current.source === 'system') {
        setThemeState({ theme: matches ? 'dark' : 'light', source: 'system' });
      }
    };

    // Align with system preference on mount if following system
    syncWithSystem(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      syncWithSystem(event.matches);
    };

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(handleChange);
    }

    return () => {
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', handleChange);
      } else if (typeof mediaQuery.removeListener === 'function') {
        mediaQuery.removeListener(handleChange);
      }
    };
  }, []);

  const setTheme = useCallback((nextTheme: Theme) => {
    setThemeState({ theme: nextTheme, source: 'user' });
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState(prevState => ({
      theme: prevState.theme === 'light' ? 'dark' : 'light',
      source: 'user',
    }));
  }, []);

  const contextValue = useMemo<ThemeContextType>(() => ({
    theme: themeState.theme,
    toggleTheme,
    setTheme,
  }), [setTheme, themeState.theme, toggleTheme]);

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);

  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return context;
};
