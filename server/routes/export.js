import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSessionData } from '../gameLogic.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', '..', 'data', 'experiment.db');

const router = Router();

// Download the raw SQLite database file (password-protected)
router.get('/database', (req, res) => {
  const password = req.headers['x-admin-password'] || req.query.password;
  if (password !== (process.env.ADMIN_PASSWORD || 'admin')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.download(DB_PATH, 'experiment.db', (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ error: 'Failed to send database file' });
    }
  });
});

// Export session data as JSON
router.get('/sessions/:id/json', (req, res) => {
  const data = getSessionData(req.params.id);
  if (!data.session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  res.json(data);
});

// Export session data as CSV
router.get('/sessions/:id/csv', (req, res) => {
  const data = getSessionData(req.params.id);
  if (!data.session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // Build CSV with all results
  const headers = [
    'round_number',
    'image_id',
    'participant_a',
    'participant_b',
    'pairing_algorithm',
    'value_a',
    'value_b',
    'difference',
    'matched',
  ];

  const rows = data.results.map((r) => [
    r.round_number,
    r.image_id,
    r.participant_a,
    r.participant_b,
    r.pairing_algorithm,
    r.value_a,
    r.value_b,
    r.difference,
    r.matched,
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="experiment-${req.params.id}.csv"`
  );
  res.send(csv);
});

// Export participants list
router.get('/sessions/:id/participants/csv', (req, res) => {
  const data = getSessionData(req.params.id);
  if (!data.session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const headers = ['id', 'connected', 'joined_at'];
  const rows = data.participants.map((p) => [
    p.id,
    p.connected,
    p.joined_at,
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="participants-${req.params.id}.csv"`
  );
  res.send(csv);
});

export default router;
