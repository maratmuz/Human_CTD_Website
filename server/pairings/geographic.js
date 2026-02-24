/**
 * Geographic Lattice Pairing Algorithm
 *
 * Participants are arranged in a ring. Each participant has K nearest neighbors.
 * Each round, they are paired with a different neighbor from their neighborhood.
 *
 * Config options:
 *   - neighborsK: number of neighbors on each side (default: 2, so 4 total neighbors)
 */
export function generatePairings(participants, roundNumber, config) {
  const n = participants.length;
  if (n < 2) return [];

  const k = config?.neighborsK || 2; // neighbors on each side
  const totalNeighbors = k * 2;

  // Build ring: participant at index i has neighbors at i±1, i±2, ..., i±k
  // Each round, pick a specific offset to pair with
  // Round 1: offset +1, Round 2: offset -1, Round 3: offset +2, etc.
  const offsets = [];
  for (let o = 1; o <= k; o++) {
    offsets.push(o);
    offsets.push(-o);
  }

  const offsetIndex = (roundNumber - 1) % offsets.length;
  const offset = offsets[offsetIndex];

  const pairs = [];
  const paired = new Set();

  for (let i = 0; i < n; i++) {
    if (paired.has(i)) continue;

    const j = ((i + offset) % n + n) % n;
    if (paired.has(j) || i === j) continue;

    pairs.push({ a: participants[i].id, b: participants[j].id });
    paired.add(i);
    paired.add(j);
  }

  return pairs;
}

export const meta = {
  name: 'geographic',
  label: 'Geographic Lattice',
  description: 'Ring topology — participants play with their nearest neighbors.',
  maxRounds: (n) => 4, // 2*k offsets by default
};
