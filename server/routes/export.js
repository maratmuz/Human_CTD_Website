import { Router } from 'express';
import { getSessionData } from '../gameLogic.js';

const router = Router();

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
