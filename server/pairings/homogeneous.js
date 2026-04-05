/**
 * Homogeneous Mixing — Complete Graph
 *
 * Every participant is connected to every other participant.
 * Each round, a random maximal matching is sampled from all possible pairs.
 * This means people rarely interact with the same partner twice,
 * enabling a single convention to snowball to universal adoption.
 */
export function buildNetwork(participants, config) {
  const n = participants.length;
  const edges = [];

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      edges.push([i, j]);
    }
  }

  return edges;
}

export const meta = {
  name: 'homogeneous-mixing',
  label: 'Homogeneous Mixing',
  description: 'Complete graph — any participant can be paired with any other each round.',
};
