import { v4 as uuidv4 } from 'uuid';
import { queries } from './db.js';
import { generatePairings } from './pairingEngine.js';

// Track active timers per session so they can be cleared
const roundTimers = new Map();   // sessionId -> setTimeout id
const feedbackTimers = new Map(); // sessionId -> setTimeout id

/**
 * Start a new round for a session.
 * Generates pairs by sampling from the network and notifies all participants.
 */
export function startRound(sessionId, io) {
  // Clear any pending feedback timer
  clearFeedbackTimer(sessionId);

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

  // Single image from config
  const imageId = config.image || 'default';

  // Create round record
  const roundId = uuidv4();
  queries.createRound.run(roundId, sessionId, roundNumber, imageId, 'active');

  // Generate pairs by sampling a matching from the network
  const algorithmName = config.pairingAlgorithm || 'homogeneous-mixing';
  const pairs = generatePairings(sessionId, algorithmName, participants, roundNumber, config.algorithmConfig);

  // Store pairs in database
  const pairRecords = pairs.map((pair) => {
    const pairId = uuidv4();
    queries.createPair.run(pairId, roundId, pair.a, pair.b, algorithmName);
    return { id: pairId, ...pair };
  });

  const roundTimer = config.roundTimer ?? 20;

  // Notify each participant of their pair assignment
  for (const pair of pairRecords) {
    const partA = participants.find((p) => p.id === pair.a);
    const partB = participants.find((p) => p.id === pair.b);

    if (partA?.socket_id) {
      io.to(partA.socket_id).emit('round:start', {
        roundId,
        roundNumber,
        pairId: pair.id,
        imageId,
        roundTimer,
      });
    }
    if (partB?.socket_id) {
      io.to(partB.socket_id).emit('round:start', {
        roundId,
        roundNumber,
        pairId: pair.id,
        imageId,
        roundTimer,
      });
    }
  }

  // Notify unpaired participants (not in the sampled matching this round)
  const pairedIds = new Set(pairs.flatMap((p) => [p.a, p.b]));
  for (const p of participants) {
    if (!pairedIds.has(p.id) && p.socket_id) {
      io.to(p.socket_id).emit('round:unpaired', { roundNumber });
    }
  }

  // Update session status
  queries.updateSessionStatus.run('playing', sessionId);

  // Set round timer if configured
  if (roundTimer > 0) {
    const timerId = setTimeout(() => {
      roundTimers.delete(sessionId);
      handleRoundTimeout(roundId, sessionId, io);
    }, roundTimer * 1000);
    roundTimers.set(sessionId, timerId);
  }

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
 * Always sends match-only feedback (no partner value or difference).
 */
function computeResult(pairId, responses, io) {
  const valueA = responses[0].value;
  const valueB = responses[1].value;
  const difference = Math.abs(valueA - valueB);

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

  // Send match-only feedback to both participants
  const participantAId = responses[0].participant_id;
  const participantBId = responses[1].participant_id;
  const partA = queries.getParticipant.get(participantAId);
  const partB = queries.getParticipant.get(participantBId);

  const feedback = { pairId, matched };
  if (partA?.socket_id) {
    io.to(partA.socket_id).emit('round:feedback', feedback);
  }
  if (partB?.socket_id) {
    io.to(partB.socket_id).emit('round:feedback', feedback);
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
    // Clear round timer if still running
    clearRoundTimer(sessionId);

    queries.updateRoundStatus.run('completed', roundId);

    const round = queries.getRound.get(roundId);
    const session = queries.getSession.get(sessionId);
    const config = JSON.parse(session.config);
    const totalMatches = results.filter((r) => r.matched).length;
    const avgDifference =
      results.length > 0
        ? results.reduce((sum, r) => sum + r.difference, 0) / results.length
        : 0;

    const feedbackTimer = config.feedbackTimer ?? 5;

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

    // Send feedback timer to participants so they can show countdown
    io.to(`session:${sessionId}`).emit('round:feedback-timer', { feedbackTimer });

    // Auto-start next round after feedback timer (if > 0)
    if (feedbackTimer > 0) {
      const timerId = setTimeout(() => {
        feedbackTimers.delete(sessionId);
        try {
          // Only auto-start if session is still active
          const currentSession = queries.getSession.get(sessionId);
          if (currentSession && currentSession.status !== 'completed') {
            const result = startRound(sessionId, io);
            io.to(`admin:${sessionId}`).emit('round:started', result);
          }
        } catch (err) {
          console.error('Auto-start next round failed:', err.message);
        }
      }, feedbackTimer * 1000);
      feedbackTimers.set(sessionId, timerId);
    }
  }
}

/**
 * Handle round timeout — auto-resolve all incomplete pairs.
 * Participants who didn't submit are treated as forfeits.
 */
export function handleRoundTimeout(roundId, sessionId, io) {
  const pairs = queries.getRoundPairs.all(roundId);
  for (const pair of pairs) {
    // Skip if already has a result
    const existingResult = queries.getRoundResults.all(roundId).find((r) => r.pair_id === pair.id);
    if (existingResult) continue;

    const responses = queries.getPairResponses.all(pair.id);

    if (responses.length === 2) {
      // Both submitted but result not computed yet (shouldn't happen, but handle it)
      computeResult(pair.id, responses, io);
    } else if (responses.length === 1) {
      // One submitted, one didn't — no match, store result
      const submitted = responses[0];
      const forfeitValue = -1; // sentinel for forfeit
      const difference = 1001; // larger than max possible, guarantees no match

      const resultId = uuidv4();
      const valueA = submitted.participant_id === pair.participant_a ? submitted.value : forfeitValue;
      const valueB = submitted.participant_id === pair.participant_b ? submitted.value : forfeitValue;
      queries.addResult.run(resultId, pair.id, 0, difference, valueA, valueB);

      // Notify the participant who submitted
      const submitter = queries.getParticipant.get(submitted.participant_id);
      if (submitter?.socket_id) {
        io.to(submitter.socket_id).emit('round:feedback', { pairId: pair.id, matched: false, timeout: true });
      }

      // Notify the participant who didn't submit
      const nonSubmitterId = pair.participant_a === submitted.participant_id ? pair.participant_b : pair.participant_a;
      const nonSubmitter = queries.getParticipant.get(nonSubmitterId);
      if (nonSubmitter?.socket_id) {
        io.to(nonSubmitter.socket_id).emit('round:feedback', { pairId: pair.id, matched: false, timeout: true });
      }
    } else {
      // Neither submitted — store result as forfeit
      const resultId = uuidv4();
      queries.addResult.run(resultId, pair.id, 0, 1001, -1, -1);

      // Notify both
      for (const pid of [pair.participant_a, pair.participant_b]) {
        const p = queries.getParticipant.get(pid);
        if (p?.socket_id) {
          io.to(p.socket_id).emit('round:feedback', { pairId: pair.id, matched: false, timeout: true });
        }
      }
    }
  }

  // Check round completion (should now be complete)
  checkRoundComplete(roundId, sessionId, io);
}

/**
 * Handle a participant disconnecting mid-round.
 * Resolves any unfinished pair involving this participant.
 */
export function handleParticipantDeparture(participantId, sessionId, io) {
  const activeRound = queries.getCurrentRound.get(sessionId);
  if (!activeRound) return;

  const pair = queries.getPairForParticipant.get(activeRound.id, participantId, participantId);
  if (!pair) return;

  // Check if this pair already has a result
  const existingResults = queries.getRoundResults.all(activeRound.id);
  if (existingResults.some((r) => r.pair_id === pair.id)) return;

  const responses = queries.getPairResponses.all(pair.id);

  if (responses.length === 1) {
    // Partner submitted but disconnected participant didn't
    const submitted = responses[0];
    const valueA = submitted.participant_id === pair.participant_a ? submitted.value : -1;
    const valueB = submitted.participant_id === pair.participant_b ? submitted.value : -1;

    const resultId = uuidv4();
    queries.addResult.run(resultId, pair.id, 0, 1001, valueA, valueB);

    // Notify the waiting partner
    const waitingId = submitted.participant_id;
    const waiting = queries.getParticipant.get(waitingId);
    if (waiting?.socket_id) {
      io.to(waiting.socket_id).emit('round:feedback', {
        pairId: pair.id,
        matched: false,
        partnerDisconnected: true,
      });
    }
  } else if (responses.length === 0) {
    // Neither submitted — store as forfeit
    const resultId = uuidv4();
    queries.addResult.run(resultId, pair.id, 0, 1001, -1, -1);

    // Notify the remaining partner (if still connected)
    const partnerId = pair.participant_a === participantId ? pair.participant_b : pair.participant_a;
    const partner = queries.getParticipant.get(partnerId);
    if (partner?.socket_id) {
      io.to(partner.socket_id).emit('round:feedback', {
        pairId: pair.id,
        matched: false,
        partnerDisconnected: true,
      });
    }
  }

  // Check if round is now complete
  checkRoundComplete(activeRound.id, sessionId, io);
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
 * Get histogram data: all response values for a specific round.
 */
export function getRoundHistogramData(roundId) {
  const rows = queries.getRoundResponseValues.all(roundId);
  return rows.map((r) => r.value).filter((v) => v >= 0);
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
 * End a session — mark as completed and clear all timers.
 */
export function endSession(sessionId, io) {
  clearRoundTimer(sessionId);
  clearFeedbackTimer(sessionId);
  queries.updateSessionStatus.run('completed', sessionId);
  io.to(`session:${sessionId}`).emit('session:ended', { sessionId });
}

function clearRoundTimer(sessionId) {
  const timerId = roundTimers.get(sessionId);
  if (timerId) {
    clearTimeout(timerId);
    roundTimers.delete(sessionId);
  }
}

export function clearFeedbackTimer(sessionId) {
  const timerId = feedbackTimers.get(sessionId);
  if (timerId) {
    clearTimeout(timerId);
    feedbackTimers.delete(sessionId);
  }
}
