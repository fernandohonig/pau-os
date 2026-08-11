// Calm, modern, educational design tokens (spec §25). Mobile-first, accessible
// contrast, no gamification noise.

export const colors = {
  background: '#F6F8FB',
  surface: '#FFFFFF',
  primary: '#3B6EF6',
  primaryText: '#FFFFFF',
  text: '#161A22',
  muted: '#6B7280',
  border: '#E5E8EE',
  success: '#0EA5A0',
  warning: '#E39A16',
  danger: '#E5484D',
  track: '#EAEEF5',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
};

export const font = {
  title: 28,
  heading: 22,
  body: 16,
  small: 13,
};

/** Colour for a mastery band, used consistently across the skill map. */
export function bandColor(band: string): string {
  switch (band) {
    case 'mastered':
      return colors.success;
    case 'developing':
      return colors.primary;
    case 'weak':
      return colors.danger;
    default:
      return colors.muted; // insufficient_evidence
  }
}

export function bandLabel(band: string): string {
  switch (band) {
    case 'mastered':
      return 'Mastered';
    case 'developing':
      return 'Developing';
    case 'weak':
      return 'Needs work';
    default:
      return 'Not enough evidence';
  }
}
