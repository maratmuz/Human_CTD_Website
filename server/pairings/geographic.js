/**
 * Spatial Network — 1D Ring Lattice (degree 4)
 *
 * Participants are arranged in a ring. Each participant is connected
 * to their 2 nearest neighbors on each side (4 total connections).
 * Each round, a random maximal matching is sampled from these edges.
 */
export function buildNetwork(participants, config) {
  const n = participants.length;
  const k = config?.neighborsK || 2;
  const edges = [];
  const edgeSet = new Set();

  for (let i = 0; i < n; i++) {
    for (let offset = 1; offset <= k; offset++) {
      const j = (i + offset) % n;
      const key = Math.min(i, j) + ':' + Math.max(i, j);
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push([Math.min(i, j), Math.max(i, j)]);
      }
    }
  }

  return edges;
}

export const meta = {
  name: 'spatial-network',
  label: 'Spatial Network',
  description: '1D ring lattice where each participant connects to 2 nearest neighbors on each side (degree 4).',
};
