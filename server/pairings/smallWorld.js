/**
 * Small-World (Watts-Strogatz) Pairing Algorithm
 *
 * Start with a ring lattice of K nearest neighbors, then rewire each edge
 * with probability β. This creates shortcuts across the network.
 *
 * The network is generated once per session (deterministic from session seed),
 * and each round pairs are drawn from the network edges.
 *
 * Config options:
 *   - neighborsK: number of neighbors on each side (default: 2)
 *   - beta: rewiring probability (default: 0.3)
 *   - seed: optional random seed for reproducibility
 */

// Simple seeded PRNG (mulberry32)
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function buildNetwork(n, k, beta, rng) {
  // Build adjacency list (ring lattice)
  const adj = Array.from({ length: n }, () => new Set());

  for (let i = 0; i < n; i++) {
    for (let offset = 1; offset <= k; offset++) {
      const j = (i + offset) % n;
      adj[i].add(j);
      adj[j].add(i);
    }
  }

  // Rewire edges with probability beta
  for (let i = 0; i < n; i++) {
    for (let offset = 1; offset <= k; offset++) {
      if (rng() < beta) {
        const oldJ = (i + offset) % n;
        // Pick a random node that isn't i and isn't already a neighbor
        let newJ;
        let attempts = 0;
        do {
          newJ = Math.floor(rng() * n);
          attempts++;
        } while ((newJ === i || adj[i].has(newJ)) && attempts < 100);

        if (attempts < 100) {
          adj[i].delete(oldJ);
          adj[oldJ].delete(i);
          adj[i].add(newJ);
          adj[newJ].add(i);
        }
      }
    }
  }

  // Convert to edge list
  const edges = [];
  for (let i = 0; i < n; i++) {
    for (const j of adj[i]) {
      if (i < j) {
        edges.push([i, j]);
      }
    }
  }

  return { adj, edges };
}

// Cache network per session
const networkCache = new Map();

export function generatePairings(participants, roundNumber, config) {
  const n = participants.length;
  if (n < 2) return [];

  const k = config?.neighborsK || 2;
  const beta = config?.beta ?? 0.3;
  const seed = config?.seed || 42;

  // Build or retrieve cached network
  const cacheKey = `${n}-${k}-${beta}-${seed}`;
  let network = networkCache.get(cacheKey);
  if (!network) {
    const rng = mulberry32(seed);
    network = buildNetwork(n, k, beta, rng);
    networkCache.set(cacheKey, network);
  }

  const { edges } = network;

  // For each round, select a maximal matching from the edges
  // Rotate through edges to vary pairings across rounds
  const rng = mulberry32(seed + roundNumber);

  // Shuffle edges for this round
  const shuffledEdges = [...edges];
  for (let i = shuffledEdges.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffledEdges[i], shuffledEdges[j]] = [shuffledEdges[j], shuffledEdges[i]];
  }

  // Greedy maximal matching
  const paired = new Set();
  const pairs = [];

  for (const [i, j] of shuffledEdges) {
    if (!paired.has(i) && !paired.has(j)) {
      pairs.push({ a: participants[i].id, b: participants[j].id });
      paired.add(i);
      paired.add(j);
    }
  }

  return pairs;
}

export const meta = {
  name: 'small-world',
  label: 'Small World (Watts-Strogatz)',
  description: 'Ring lattice with random shortcuts. Rewiring probability β controls shortcut density.',
  maxRounds: (n) => Infinity,
};
