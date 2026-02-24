import { v4 as uuidv4 } from 'uuid';
import { queries } from './db.js';
import { generatePairings } from './pairingEngine.js';

/**
 * Start a new round for a session.
 * Generates pairs and notifies all participants.
 */
export function startRound(sessionId, io) {
  const session = queries.getSession.get(sessionId);
  if (!session) throw new Error('Session not found');

  const config = JSON.parse(session.config);
  const participants = queries.getSessionParticipants.all(sessionId);

  if (participants.length < 2) {
    throw new Error('Need at least 2 connected participants to start a round');
  }

  // Determine round number
  const existingRounds = queries.getSessionRounds.all(sessionId);
  const roundNumber = existingRounds.length + 1;

  // Pick image for this round (cycle through configured images)
  const images = config.images || ['default'];
  const imageId = images[(roundNumber - 1) % images.length];

  // Create round record
  const roundId = uuidv4();
  queries.createRound.run(roundId, sessionId, roundNumber, imageId, 'active');

  // Generate pairs using selected algorithm
  const algorithmName = config.pairingAlgorithm || 'random-mixing';
  const pairs = generatePairings(algorithmName, participants, roundNumber, config.algorithmConfig);

  // Store pairs in database
  const pairRecords = pairs.map((pair) => {
    const pairId = uuidv4();
    queries.createPair.run(pairId, roundId, pair.a, pair.b, algorithmName);
    return { id: pairId, ...pair };
  });

  // Notify each participant of their pair assignment
  for (const pair of pairRecords) {
    const partA = participants.find((p) => p.id === pair.a);
    const partB = participants.find((p) => p.id === pair.b);

    if (partA?.socket_id) {
      io.to(partA.socket_id).emit('round:start', {
        roundId,
        roundNumber,
        pairId: pair.id,
        partnerId: pair.b,
        partnerName: partB?.display_name || 'Unknown',
        imageId,
      });
    }
    if (partB?.socket_id) {
      io.to(partB.socket_id).emit('round:start', {
        roundId,
        roundNumber,
        pairId: pair.id,
        partnerId: pair.a,
        partnerName: partA?.display_name || 'Unknown',
        imageId,
      });
    }
  }

  // Notify unpaired participants (odd one out)
  const pairedIds = new Set(pairs.flatMap((p) => [p.a, p.b]));
  for (const p of participants) {
    if (!pairedIds.has(p.id) && p.socket_id) {
      io.to(p.socket_id).emit('round:unpaired', { roundNumber });
    }
  }

  // Update session status
  queries.updateSessionStatus.run('playing', sessionId);

  return {
    roundId,
    roundNumber,
    pairs: pairRecords,
    imageId,
    unpairedCount: participants.length - pairedIds.size,
  };
}

/**
 * Process a participant's response for a pair.
 * If both partners have responded, compute the result and send feedback.
 */
export function submitResponse(pairId, participantId, value, io) {
  // Prevent duplicate submissions
  const existing = queries.getPairResponses.all(pairId);
  if (existing.some((r) => r.participant_id === participantId)) {
    return { error: 'Already submitted' };
  }

  const responseId = uuidv4();
  queries.addResponse.run(responseId, pairId, participantId, value);

  // Check if both responses are in
  const responses = queries.getPairResponses.all(pairId);
  if (responses.length === 2) {
    return computeResult(pairId, responses, io);
  }

  // Only one response so far — notify partner they're waiting
  const pair = queries.getPair.get(pairId);
  if (pair) {
    const partnerId = pair.participant_a === participantId ? pair.participant_b : pair.participant_a;
    const partner = queries.getParticipant.get(partnerId);
    if (partner?.socket_id) {
      io.to(partner.socket_id).emit('partner:submitted', { pairId });
    }
  }

  return { waiting: true };
}

/**
 * Compute result for a completed pair and send feedback.
 */
function computeResult(pairId, responses, io) {
  const valueA = responses[0].value;
  const valueB = responses[1].value;
  const difference = Math.abs(valueA - valueB);

  // Navigate: pair -> round -> session to get config
  const pair = queries.getPair.get(pairId);
  if (!pair) return { error: 'Pair not found' };

  const round = queries.getRound.get(pair.round_id);
  if (!round) return { error: 'Round not found' };

  const session = queries.getSession.get(round.session_id);
  const config = JSON.parse(session.config);
  const tolerance = config.tolerance ?? 50;
  const matched = difference <= tolerance;

  // Store result
  const resultId = uuidv4();
  queries.addResult.run(resultId, pairId, matched ? 1 : 0, difference, valueA, valueB);

  // Send feedback based on admin-configured feedback mode
  const feedbackMode = config.feedbackMode || 'match-only';

  const participantAId = responses[0].participant_id;
  const participantBId = responses[1].participant_id;
  const partA = queries.getParticipant.get(participantAId);
  const partB = queries.getParticipant.get(participantBId);

  for (const [participant, ownValue, partnerValue] of [
    [partA, valueA, valueB],
    [partB, valueB, valueA],
  ]) {
    if (!participant?.socket_id) continue;

    const feedback = { pairId, matched };

    if (feedbackMode === 'show-partner' || feedbackMode === 'show-all') {
      feedback.partnerValue = partnerValue;
    }
    if (feedbackMode === 'show-all') {
      feedback.difference = difference;
      feedback.ownValue = ownValue;
    }

    io.to(participant.socket_id).emit('round:feedback', feedback);
  }

  // Check if all pairs in the round are complete
  checkRoundComplete(round.id, round.session_id, io);

  return { matched, difference };
}

/**
 * Check if all pairs in a round have results. If so, mark round complete.
 */
function checkRoundComplete(roundId, sessionId, io) {
  const pairs = queries.getRoundPairs.all(roundId);
  const results = queries.getRoundResults.all(roundId);

  if (results.length >= pairs.length) {
    queries.updateRoundStatus.run('completed', roundId);

    const round = queries.getRound.get(roundId);
    const totalMatches = results.filter((r) => r.matched).length;
    const avgDifference =
      results.length > 0
        ? results.reduce((sum, r) => sum + r.difference, 0) / results.length
        : 0;

    // Notify admin
    io.to(`admin:${sessionId}`).emit('round:complete', {
      roundId,
      roundNumber: round.round_number,
      stats: {
        totalPairs: pairs.length,
        matches: totalMatches,
        matchRate: Math.round((totalMatches / pairs.length) * 100) / 100,
        avgDifference: Math.round(avgDifference * 10) / 10,
      },
    });

    // Notify all participants that round is over
    io.to(`session:${sessionId}`).emit('round:ended', { roundId });
  }
}

/**
 * Get round progress for admin dashboard.
 */
export function getRoundProgress(roundId) {
  const pairs = queries.getRoundPairs.all(roundId);
  const results = queries.getRoundResults.all(roundId);

  const pairDetails = pairs.map((pair) => {
    const responses = queries.getPairResponses.all(pair.id);
    const result = results.find((r) => r.pair_id === pair.id);

    return {
      pairId: pair.id,
      participantA: pair.participant_a,
      participantB: pair.participant_b,
      responsesSubmitted: responses.length,
      completed: !!result,
      matched: result?.matched === 1,
      difference: result?.difference,
    };
  });

  return {
    totalPairs: pairs.length,
    completedPairs: results.length,
    pairDetails,
  };
}

/**
 * Get full session data for export.
 */
export function getSessionData(sessionId) {
  const session = queries.getSession.get(sessionId);
  const participants = queries.getAllSessionParticipants.all(sessionId);
  const rounds = queries.getSessionRounds.all(sessionId);
  const allResults = queries.getSessionResults.all(sessionId);

  return { session, participants, rounds, results: allResults };
}

/**
 * End a session — mark as completed.
 */
export function endSession(sessionId, io) {
  queries.updateSessionStatus.run('completed', sessionId);
  io.to(`session:${sessionId}`).emit('session:ended', { sessionId });
}
