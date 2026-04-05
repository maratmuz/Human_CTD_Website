import { Router } from 'express';
import crypto from 'crypto';
import { queries } from '../db.js';
import { getAlgorithms } from '../pairingEngine.js';

/** Generate a short, human-friendly session code (e.g. "A3X9K2") */
function shortId(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

function authMiddleware(req, res, next) {
  const password = req.headers['x-admin-password'] || req.query.password;
  if (password !== (process.env.ADMIN_PASSWORD || 'admin')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

export default function adminRouter(io) {
  const router = Router();
  router.use(authMiddleware);

  // Create a new session
  router.post('/sessions', (req, res) => {
    const { name, config } = req.body;
    const id = shortId();
    const sessionConfig = {
      tolerance: 50,
      pairingAlgorithm: 'homogeneous-mixing',
      algorithmConfig: {},
      image: 'default',
      roundTimer: 20,
      feedbackTimer: 5,
      ...config,
    };

    queries.createSession.run(id, name || 'Experiment', JSON.stringify(sessionConfig), 'lobby');
    const session = queries.getSession.get(id);
    res.json(session);
  });

  // Get all sessions
  router.get('/sessions', (req, res) => {
    const sessions = queries.getAllSessions.all();
    res.json(sessions);
  });

  // Get a specific session with participants
  router.get('/sessions/:id', (req, res) => {
    const session = queries.getSession.get(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const participants = queries.getSessionParticipants.all(req.params.id);
    const rounds = queries.getSessionRounds.all(req.params.id);
    res.json({ session, participants, rounds });
  });

  // Update session config
  router.put('/sessions/:id/config', (req, res) => {
    const session = queries.getSession.get(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const currentConfig = JSON.parse(session.config);
    const newConfig = { ...currentConfig, ...req.body };
    queries.updateSessionConfig.run(JSON.stringify(newConfig), req.params.id);

    res.json({ config: newConfig });
  });

  // Update session status (e.g., lock lobby)
  router.put('/sessions/:id/status', (req, res) => {
    const { status } = req.body;
    queries.updateSessionStatus.run(status, req.params.id);
    const session = queries.getSession.get(req.params.id);

    if (status === 'lobby-locked') {
      io.to(`session:${req.params.id}`).emit('session:locked');
    }

    res.json(session);
  });

  // Delete a session and all related data
  router.delete('/sessions/:id', (req, res) => {
    const session = queries.getSession.get(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const id = req.params.id;
    // Delete in correct order to respect foreign keys
    queries.deleteSessionResults.run(id);
    queries.deleteSessionResponses.run(id);
    queries.deleteSessionPairs.run(id);
    queries.deleteSessionRounds.run(id);
    queries.deleteSessionParticipants.run(id);
    queries.deleteSession.run(id);

    // Disconnect any connected participants
    io.to(`session:${id}`).emit('session:ended', { sessionId: id });

    res.json({ deleted: true });
  });

  return router;
}
