/**
 * Random Network — Random Regular Graph (degree 4)
 *
 * Each participant has exactly 4 random connections.
 * Uses a configuration model approach: create 4 "stubs" per node,
 * randomly pair stubs, reject self-loops and multi-edges.
 * Falls back to greedy random edge selection if configuration model fails.
 */

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildNetwork(participants, config) {
  const n = participants.length;
  const degree = 4;
  const seed = config?.seed || 42;

  // Need n > degree for a valid regular graph, and n * degree must be even
  if (n <= degree || (n * degree) % 2 !== 0) {
    const edges = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        edges.push([i, j]);
      }
    }
    return edges;
  }

  const rng = mulberry32(seed);

  // Try configuration model up to 100 times
  for (let attempt = 0; attempt < 100; attempt++) {
    const stubs = [];
    for (let i = 0; i < n; i++) {
      for (let d = 0; d < degree; d++) {
        stubs.push(i);
      }
    }

    // Fisher-Yates shuffle
    for (let i = stubs.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [stubs[i], stubs[j]] = [stubs[j], stubs[i]];
    }

    // Pair consecutive stubs
    const edgeSet = new Set();
    const edges = [];
    let valid = true;

    for (let i = 0; i < stubs.length; i += 2) {
      const a = Math.min(stubs[i], stubs[i + 1]);
      const b = Math.max(stubs[i], stubs[i + 1]);
      if (a === b) {
        valid = false;
        break;
      }
      const key = `${a}:${b}`;
      if (edgeSet.has(key)) {
        valid = false;
        break;
      }
      edgeSet.add(key);
      edges.push([a, b]);
    }

    if (valid) return edges;
  }

  // Fallback: greedy random edge selection targeting degree 4
  const edges = [];
  const adj = Array.from({ length: n }, () => new Set());
  const allPairs = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      allPairs.push([i, j]);
    }
  }
  for (let i = allPairs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [allPairs[i], allPairs[j]] = [allPairs[j], allPairs[i]];
  }
  for (const [a, b] of allPairs) {
    if (adj[a].size < degree && adj[b].size < degree) {
      adj[a].add(b);
      adj[b].add(a);
      edges.push([a, b]);
    }
  }
  return edges;
}

export const meta = {
  name: 'random-network',
  label: 'Random Network',
  description: 'Random regular graph where each participant has exactly 4 random connections.',
};
