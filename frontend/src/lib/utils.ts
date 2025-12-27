import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Design system colors for use in charts, inline styles, and JS libraries
 * These values match the CSS variables in theme.css
 */
export const colors = {
  // Risk levels
  risk: {
    high: '#ef4444',
    medium: '#f59e0b',
    low: '#75caa9',
  },
  // Chart colors
  chart: {
    grid: {
      light: '#e5e7eb',
      dark: '#374151',
    },
    axis: {
      light: '#6b7280',
      dark: '#9ca3af',
    },
    primary: '#3b82f6',
    success: '#75caa9',
    warning: '#f59e0b',
    danger: '#ef4444',
    purple: '#8b5cf6',
  },
  // Brand colors
  brand: {
    green: '#75caa9',
    greenHover: '#5ba98b',
    greenDark: '#4a9d7c',
  },
  // Third-party
  teams: {
    purple: '#5b5fc7',
    purpleHover: '#4b4fb7',
  },
  // Tooltip backgrounds
  tooltip: {
    light: 'rgba(31, 41, 55, 0.95)',
    dark: 'rgba(31, 41, 55, 0.95)',
  },
  // Grays (matching dark-* scale)
  gray: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
    950: '#0d1117',
  },
} as const

/**
 * Get chart colors based on current theme
 */
export function getChartColors(isDark: boolean) {
  return {
    grid: isDark ? colors.chart.grid.dark : colors.chart.grid.light,
    axis: isDark ? colors.chart.axis.dark : colors.chart.axis.light,
    tooltip: colors.tooltip.light,
  }
}

/**
 * Get risk color based on risk level
 */
export function getRiskColor(level: 'high' | 'medium' | 'low' | 'High' | 'Medium' | 'Low'): string {
  const normalizedLevel = level.toLowerCase() as 'high' | 'medium' | 'low'
  return colors.risk[normalizedLevel]
}
