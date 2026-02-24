import * as roundRobin from './pairings/roundRobin.js';
import * as randomMixing from './pairings/randomMixing.js';
import * as geographic from './pairings/geographic.js';
import * as smallWorld from './pairings/smallWorld.js';
import * as custom from './pairings/custom.js';

const algorithms = {
  'round-robin': roundRobin,
  'random-mixing': randomMixing,
  'geographic': geographic,
  'small-world': smallWorld,
  'custom': custom,
};

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
 * Generate pairings for a given round using the specified algorithm.
 *
 * @param {string} algorithmName - Name of the algorithm (e.g. 'round-robin')
 * @param {Array} participants - Array of participant objects with at least { id }
 * @param {number} roundNumber - 1-indexed round number
 * @param {object} config - Algorithm-specific configuration
 * @returns {Array<{a: string, b: string}>} Array of pair objects
 */
export function generatePairings(algorithmName, participants, roundNumber, config = {}) {
  const algorithm = algorithms[algorithmName];
  if (!algorithm) {
    throw new Error(`Unknown pairing algorithm: ${algorithmName}`);
  }
  return algorithm.generatePairings(participants, roundNumber, config);
}

/**
 * Get the maximum number of rounds for an algorithm given participant count.
 */
export function getMaxRounds(algorithmName, participantCount) {
  const algorithm = algorithms[algorithmName];
  if (!algorithm) return Infinity;
  return algorithm.meta.maxRounds(participantCount);
}
