/**
 * Format a duration in seconds as human-readable text, e.g. "20 minutes and 34 seconds".
 *
 * Drops zero-valued units, pluralizes, and joins parts with commas and "and"
 * ("1 day, 2 hours and 3 seconds"). Fractions are floored; a zero or
 * sub-second duration returns "0 seconds". Ported from tally-split-ai.
 * @param seconds - Non-negative duration in seconds.
 */
export function formatUptime(seconds: number) {
  const units = [
    [Math.floor(seconds / 86400), 'day'],
    [Math.floor((seconds % 86400) / 3600), 'hour'],
    [Math.floor((seconds % 3600) / 60), 'minute'],
    [Math.floor(seconds % 60), 'second'],
  ] as const

  const parts = units
    .filter(([value]) => value > 0)
    .map(([value, unit]) => `${value} ${unit}${value === 1 ? '' : 's'}`)
  if (parts.length === 0) {
    return '0 seconds'
  }
  const last = parts.pop()!
  return parts.length === 0 ? last : `${parts.join(', ')} and ${last}`
}
