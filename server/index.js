import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs';
import { queries } from './db.js';
import {
  startRound, submitResponse, getRoundProgress,
  endSession, handleParticipantDeparture, handleRoundTimeout,
  getRoundHistogramData,
} from './gameLogic.js';
import { getAlgorithms } from './pairingEngine.js';

/** Generate a short participant ID like "P-A3X9" */
function generateParticipantId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(4);
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return `P-${code}`;
}

import adminRouter from './routes/admin.js';
import exportRouter from './routes/export.js';

const app = express();
const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

// Serve static images
app.use('/images', express.static(path.join(__dirname, '..', 'images')));

// API routes
app.use('/api/admin', adminRouter(io));
app.use('/api/export', exportRouter);

// Algorithms list
app.get('/api/algorithms', (req, res) => {
  res.json(getAlgorithms());
});

// List available images in the images/ directory
app.get('/api/images', (req, res) => {
  const imagesDir = path.join(__dirname, '..', 'images');
  try {
    const files = fs.readdirSync(imagesDir);
    const images = files
      .filter((f) => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f));
    res.json(images);
  } catch {
    res.json([]);
  }
});

// Serve client in production
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// ─── Socket.IO Connection Handling ───────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // ── Participant joins a session ──
  socket.on('session:join', ({ sessionId }, callback) => {
    const session = queries.getSession.get(sessionId);
    if (!session) {
      return callback?.({ error: 'Session not found' });
    }
    if (session.status !== 'lobby') {
      return callback?.({ error: 'Session is not accepting new participants' });
    }

    const participantId = generateParticipantId();
    queries.addParticipant.run(participantId, sessionId, socket.id);

    socket.join(`session:${sessionId}`);
    socket.data = { participantId, sessionId };

    // Broadcast updated participant list to admin
    const participants = queries.getSessionParticipants.all(sessionId);
    io.to(`admin:${sessionId}`).emit('participants:update', participants);
    io.to(`session:${sessionId}`).emit('participants:count', participants.length);

    callback?.({
      participantId,
      participantCount: participants.length,
    });
  });

  // ── Participant reconnects ──
  socket.on('session:reconnect', ({ sessionId, participantId }, callback) => {
    const participant = queries.getParticipant.get(participantId);
    if (!participant || participant.session_id !== sessionId) {
      return callback?.({ error: 'Invalid reconnection' });
    }

    queries.updateParticipantSocket.run(socket.id, participantId);
    socket.join(`session:${sessionId}`);
    socket.data = { participantId, sessionId };

    // Check if there's an active round
    const activeRound = queries.getCurrentRound.get(sessionId);
    if (activeRound) {
      const pair = queries.getPairForParticipant.get(activeRound.id, participantId, participantId);
      if (pair) {
        const responses = queries.getPairResponses.all(pair.id);
        const hasSubmitted = responses.some((r) => r.participant_id === participantId);
        callback?.({
          reconnected: true,
          activeRound: {
            roundId: activeRound.id,
            roundNumber: activeRound.round_number,
            pairId: pair.id,
            imageId: activeRound.image_id,
            hasSubmitted,
          },
        });
        return;
      }
    }

    const participants = queries.getSessionParticipants.all(sessionId);
    io.to(`admin:${sessionId}`).emit('participants:update', participants);

    callback?.({ reconnected: true });
  });

  // ── Admin joins ──
  socket.on('admin:join', ({ sessionId }, callback) => {
    socket.join(`admin:${sessionId}`);
    socket.data = { isAdmin: true, sessionId };

    const session = queries.getSession.get(sessionId);
    const participants = queries.getSessionParticipants.all(sessionId);
    const rounds = queries.getSessionRounds.all(sessionId);

    callback?.({ session, participants, rounds });
  });

  // ── Admin starts a round ──
  socket.on('admin:startRound', ({ sessionId }, callback) => {
    try {
      const result = startRound(sessionId, io);
      // Also notify admin
      io.to(`admin:${sessionId}`).emit('round:started', result);
      callback?.({ success: true, ...result });
    } catch (err) {
      callback?.({ error: err.message });
    }
  });

  // ── Admin force-ends current round ──
  socket.on('admin:forceEndRound', ({ sessionId }, callback) => {
    try {
      const activeRound = queries.getCurrentRound.get(sessionId);
      if (!activeRound) {
        return callback?.({ error: 'No active round' });
      }
      handleRoundTimeout(activeRound.id, sessionId, io);
      callback?.({ success: true });
    } catch (err) {
      callback?.({ error: err.message });
    }
  });

  // ── Admin ends session ──
  socket.on('admin:endSession', ({ sessionId }, callback) => {
    try {
      endSession(sessionId, io);
      callback?.({ success: true });
    } catch (err) {
      callback?.({ error: err.message });
    }
  });

  // ── Admin requests histogram data for a round ──
  socket.on('admin:getHistogramData', ({ roundId }, callback) => {
    try {
      const values = getRoundHistogramData(roundId);
      callback?.({ values });
    } catch (err) {
      callback?.({ error: err.message });
    }
  });

  // ── Participant submits a value ──
  socket.on('response:submit', ({ pairId, value }, callback) => {
    const { participantId } = socket.data || {};
    if (!participantId) {
      return callback?.({ error: 'Not authenticated' });
    }

    if (typeof value !== 'number' || value < 0 || value > 1000) {
      return callback?.({ error: 'Value must be between 0 and 1000' });
    }

    try {
      const result = submitResponse(pairId, participantId, Math.round(value), io);

      // Update admin with progress
      const pair = queries.getPair.get(pairId);
      if (pair) {
        const round = queries.getRound.get(pair.round_id);
        if (round) {
          const progress = getRoundProgress(round.id);
          io.to(`admin:${round.session_id}`).emit('round:progress', progress);
        }
      }

      callback?.({ success: true, ...result });
    } catch (err) {
      callback?.({ error: err.message });
    }
  });

  // ── Admin requests round progress ──
  socket.on('admin:getRoundProgress', ({ roundId }, callback) => {
    try {
      const progress = getRoundProgress(roundId);
      callback?.(progress);
    } catch (err) {
      callback?.({ error: err.message });
    }
  });

  // ── Disconnect handling ──
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    const { participantId, sessionId } = socket.data || {};

    queries.disconnectParticipant.run(socket.id);

    if (sessionId) {
      // Handle mid-round departure
      if (participantId) {
        handleParticipantDeparture(participantId, sessionId, io);
      }

      const participants = queries.getSessionParticipants.all(sessionId);
      io.to(`admin:${sessionId}`).emit('participants:update', participants);
      io.to(`session:${sessionId}`).emit('participants:count', participants.length);
    }
  });
});

// ─── Start Server ────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
