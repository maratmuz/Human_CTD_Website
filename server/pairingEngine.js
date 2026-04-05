import * as spatialNetwork from './pairings/geographic.js';
import * as randomNetwork from './pairings/randomMixing.js';
import * as homogeneousMixing from './pairings/homogeneous.js';

const algorithms = {
  'spatial-network': spatialNetwork,
  'random-network': randomNetwork,
  'homogeneous-mixing': homogeneousMixing,
};

// Cache networks per session so the network is stable across rounds
const networkCache = new Map();

/**
 * Get all available pairing algorithms with their metadata.
 */
export function getAlgorithms() {
  return Object.entries(algorithms).map(([key, mod]) => ({
    id: key,
    ...mod.meta,
  }));
}

/**
 * Build or retrieve the cached network for a session.
 * The network is a set of all possible edges (connections) between participants.
 * Each round, a random subset of these edges is selected as actual pairings.
 */
export function getOrBuildNetwork(sessionId, algorithmName, participants, config = {}) {
  const cacheKey = `${sessionId}:${algorithmName}`;
  const cached = networkCache.get(cacheKey);

  // Return cached if participant list hasn't changed
  if (cached && cached.participantIds.length === participants.length &&
      cached.participantIds.every((id, i) => id === participants[i].id)) {
    return cached;
  }

  const algorithm = algorithms[algorithmName];
  if (!algorithm) {
    throw new Error(`Unknown pairing algorithm: ${algorithmName}`);
  }

  const edges = algorithm.buildNetwork(participants, config);
  const network = {
    edges,
    participantIds: participants.map((p) => p.id),
  };

  networkCache.set(cacheKey, network);
  return network;
}

/**
 * Generate pairings for a round by sampling a random maximal matching
 * from the network's edges.
 */
export function generatePairings(sessionId, algorithmName, participants, roundNumber, config = {}) {
  const network = getOrBuildNetwork(sessionId, algorithmName, participants, config);
  return sampleMatchingFromNetwork(network, roundNumber);
}

/**
 * Given a network, randomly sample a maximal matching.
 * Shuffles all edges using the round number as a seed variation,
 * then greedily picks non-overlapping pairs.
 */
function sampleMatchingFromNetwork(network, roundNumber) {
  const { edges, participantIds } = network;
  if (edges.length === 0) return [];

  // Shuffle edges differently each round (seeded by round number)
  const shuffled = [...edges];
  let seed = roundNumber * 2654435761;
  for (let i = shuffled.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const j = seed % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Greedy maximal matching
  const paired = new Set();
  const pairs = [];

  for (const [i, j] of shuffled) {
    if (!paired.has(i) && !paired.has(j)) {
      pairs.push({ a: participantIds[i], b: participantIds[j] });
      paired.add(i);
      paired.add(j);
    }
  }

  return pairs;
}

/**
 * Get the network edges for a session (for admin visualization).
 */
export function getNetworkEdges(sessionId, algorithmName, participants, config = {}) {
  const network = getOrBuildNetwork(sessionId, algorithmName, participants, config);
  return network.edges.map(([i, j]) => ({
    a: network.participantIds[i],
    b: network.participantIds[j],
  }));
}

/**
 * Clear cached network for a session.
 */
export function clearNetworkCache(sessionId) {
  for (const key of networkCache.keys()) {
    if (key.startsWith(`${sessionId}:`)) {
      networkCache.delete(key);
    }
  }
}
