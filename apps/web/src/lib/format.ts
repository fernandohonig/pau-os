import type { MasteryBand } from '../api';

/** Human label for a mastery band (spec §8 bands). */
export function bandLabel(band: MasteryBand): string {
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

/** CSS variable holding the band's color (defined in theme.css). */
export function bandVar(band: MasteryBand): string {
  switch (band) {
    case 'mastered':
      return 'var(--band-mastered)';
    case 'developing':
      return 'var(--band-developing)';
    case 'weak':
      return 'var(--band-weak)';
    default:
      return 'var(--band-none)';
  }
}

/** Status tone for a band — drives icon/label semantics, never color alone. */
export function bandTone(band: MasteryBand): 'good' | 'info' | 'serious' | 'muted' {
  switch (band) {
    case 'mastered':
      return 'good';
    case 'developing':
      return 'info';
    case 'weak':
      return 'serious';
    default:
      return 'muted';
  }
}

const REASON_LABELS: Record<string, string> = {
  LOW_MASTERY: 'Low mastery',
  DEVELOPING_MASTERY: 'Still developing',
  HIGH_LEARNING_VALUE: 'High learning value',
  LOW_CONFIDENCE: 'Needs more evidence',
  NEEDS_EVIDENCE: 'Needs more evidence',
  HIGH_TARGET_RELEVANCE: 'Key for your target',
  HIGH_EXAM_RELEVANCE: 'Common on the exam',
  PREREQUISITES_WEAK: 'Prerequisites are weak',
  RECENTLY_PRACTICED: 'Recently practiced',
};

export function reasonLabel(code: string): string {
  return REASON_LABELS[code] ?? code.toLowerCase().replace(/_/g, ' ');
}

/** Turn a skill id like "mathematics.analysis.limits" into "Limits". */
export function skillLabel(skillId: string, names?: Record<string, string>): string {
  if (names && names[skillId]) return names[skillId];
  const leaf = skillId.split('.').pop() ?? skillId;
  return leaf.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function round(n: number, dp = 1): string {
  return n.toFixed(dp);
}
