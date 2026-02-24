/**
 * Custom Pairing Algorithm Template
 *
 * Duplicate this file and implement your own pairing logic.
 *
 * The function receives:
 *   - participants: Array of { id, display_name, ... } objects
 *   - roundNumber: Current round number (1-indexed)
 *   - config: Algorithm-specific configuration from the admin panel
 *
 * It must return an array of { a, b } objects where a and b are participant IDs.
 * Each participant should appear in at most one pair per round.
 *
 * Example: pair every other person (even indices with odd indices)
 */
export function generatePairings(participants, roundNumber, config) {
  const n = participants.length;
  if (n < 2) return [];

  const pairs = [];
  // Simple example: pair index 0 with 1, 2 with 3, etc.
  // Then shift by roundNumber to vary
  const shift = (roundNumber - 1) % n;
  const shifted = [
    ...participants.slice(shift),
    ...participants.slice(0, shift),
  ];

  for (let i = 0; i < shifted.length - 1; i += 2) {
    pairs.push({ a: shifted[i].id, b: shifted[i + 1].id });
  }

  return pairs;
}

export const meta = {
  name: 'custom',
  label: 'Custom',
  description: 'A template for creating your own pairing algorithm. Edit server/pairings/custom.js.',
  maxRounds: (n) => Infinity,
};
