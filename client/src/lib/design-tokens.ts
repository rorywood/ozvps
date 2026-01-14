/**
 * Design Tokens - Centralized design system values
 *
 * This file contains all design tokens used across the application.
 * Do NOT use magic numbers in components - import these tokens instead.
 */

// Spacing scale (8px base unit)
export const spacing = {
  xs: '0.5rem',   // 8px
  sm: '1rem',     // 16px
  md: '1.5rem',   // 24px
  lg: '2rem',     // 32px
  xl: '3rem',     // 48px
  '2xl': '4rem',  // 64px
} as const;

// Typography hierarchy
export const typography = {
  display: {
    xl: 'text-4xl font-bold tracking-tight',       // Page titles (36px)
    lg: 'text-3xl font-semibold tracking-tight',   // Section titles (30px)
    md: 'text-2xl font-semibold',                  // Card titles (24px)
  },
  body: {
    lg: 'text-base font-normal',                   // Main content (16px)
    md: 'text-sm font-normal',                     // Secondary content (14px)
    sm: 'text-xs font-normal',                     // Tertiary content (12px)
  },
  label: {
    lg: 'text-sm font-medium',                     // Form labels (14px)
    md: 'text-xs font-medium',                     // Small labels (12px)
    sm: 'text-xs font-semibold uppercase tracking-wide', // Tags (12px)
  }
} as const;

// Border radius scale
export const radius = {
  sm: '0.375rem',  // 6px - buttons, inputs
  md: '0.5rem',    // 8px - cards
  lg: '0.75rem',   // 12px - modals
  xl: '1rem',      // 16px - large cards
  full: '9999px',  // badges, pills, circles
} as const;

// Shadow scale
export const shadows = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
} as const;

// Icon sizes
export const iconSizes = {
  xs: 'h-3 w-3',   // 12px
  sm: 'h-4 w-4',   // 16px
  md: 'h-5 w-5',   // 20px
  lg: 'h-6 w-6',   // 24px
  xl: 'h-8 w-8',   // 32px
  '2xl': 'h-10 w-10', // 40px
} as const;

// Animation durations
export const duration = {
  fast: '150ms',
  normal: '200ms',
  slow: '300ms',
} as const;

// Z-index scale
export const zIndex = {
  dropdown: 1000,
  sticky: 1020,
  fixed: 1030,
  modalBackdrop: 1040,
  modal: 1050,
  popover: 1060,
  tooltip: 1070,
} as const;
