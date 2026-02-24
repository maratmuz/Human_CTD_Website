/**
 * Round-Robin Pairing Algorithm
 *
 * Classic tournament scheduling. Over N-1 rounds (for N participants),
 * every participant plays every other participant exactly once.
 *
 * Uses the "circle method": fix one participant, rotate the rest.
 */
export function generatePairings(participants, roundNumber, config) {
  const n = participants.length;
  if (n < 2) return [];

  // For odd number of participants, add a "bye" placeholder
  const players = [...participants];
  const hasBye = n % 2 !== 0;
  if (hasBye) {
    players.push({ id: '__bye__' });
  }

  const count = players.length;
  const fixed = players[0];
  const rotating = players.slice(1);

  // Rotate for the given round (0-indexed internally)
  const round = (roundNumber - 1) % (count - 1);
  const rotated = [...rotating];
  for (let i = 0; i < round; i++) {
    rotated.unshift(rotated.pop());
  }

  const pairs = [];
  // Fixed player pairs with first in rotated list
  if (fixed.id !== '__bye__' && rotated[0].id !== '__bye__') {
    pairs.push({ a: fixed.id, b: rotated[0].id });
  }

  // Pair remaining: i-th from start with i-th from end
  for (let i = 1; i < count / 2; i++) {
    const a = rotated[i];
    const b = rotated[count - 1 - i];
    if (a.id !== '__bye__' && b.id !== '__bye__') {
      pairs.push({ a: a.id, b: b.id });
    }
  }

  return pairs;
}

export const meta = {
  name: 'round-robin',
  label: 'Round Robin',
  description: 'Everyone plays everyone else. Takes N-1 rounds for N participants.',
  maxRounds: (n) => n % 2 === 0 ? n - 1 : n,
};
