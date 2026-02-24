/**
 * Random Mixing Pairing Algorithm
 *
 * Each round, participants are shuffled randomly and paired with adjacent players.
 * Like Centola's "random mixing" condition — new random partner each round.
 */
export function generatePairings(participants, roundNumber, config) {
  const n = participants.length;
  if (n < 2) return [];

  // Fisher-Yates shuffle
  const shuffled = [...participants];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const pairs = [];
  for (let i = 0; i < shuffled.length - 1; i += 2) {
    pairs.push({ a: shuffled[i].id, b: shuffled[i + 1].id });
  }

  return pairs;
}

export const meta = {
  name: 'random-mixing',
  label: 'Random Mixing',
  description: 'Random partner each round. Participants are shuffled and paired.',
  maxRounds: (n) => Infinity,
};
