import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'data', 'experiment.db');

// Ensure data directory exists
import fs from 'fs';
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    config TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'lobby',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS participants (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    socket_id TEXT,
    connected INTEGER NOT NULL DEFAULT 1,
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE TABLE IF NOT EXISTS rounds (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    image_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    started_at TEXT,
    completed_at TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE TABLE IF NOT EXISTS pairs (
    id TEXT PRIMARY KEY,
    round_id TEXT NOT NULL,
    participant_a TEXT NOT NULL,
    participant_b TEXT NOT NULL,
    pairing_algorithm TEXT NOT NULL,
    FOREIGN KEY (round_id) REFERENCES rounds(id),
    FOREIGN KEY (participant_a) REFERENCES participants(id),
    FOREIGN KEY (participant_b) REFERENCES participants(id)
  );

  CREATE TABLE IF NOT EXISTS responses (
    id TEXT PRIMARY KEY,
    pair_id TEXT NOT NULL,
    participant_id TEXT NOT NULL,
    value INTEGER NOT NULL,
    submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (pair_id) REFERENCES pairs(id),
    FOREIGN KEY (participant_id) REFERENCES participants(id)
  );

  CREATE TABLE IF NOT EXISTS results (
    id TEXT PRIMARY KEY,
    pair_id TEXT NOT NULL UNIQUE,
    matched INTEGER NOT NULL DEFAULT 0,
    difference INTEGER NOT NULL,
    value_a INTEGER NOT NULL,
    value_b INTEGER NOT NULL,
    FOREIGN KEY (pair_id) REFERENCES pairs(id)
  );
`);

// Prepared statements for common operations
export const queries = {
  // Sessions
  createSession: db.prepare(
    'INSERT INTO sessions (id, name, config, status) VALUES (?, ?, ?, ?)'
  ),
  getSession: db.prepare('SELECT * FROM sessions WHERE id = ?'),
  updateSessionStatus: db.prepare('UPDATE sessions SET status = ? WHERE id = ?'),
  updateSessionConfig: db.prepare('UPDATE sessions SET config = ? WHERE id = ?'),
  getAllSessions: db.prepare('SELECT * FROM sessions ORDER BY created_at DESC'),
  deleteSession: db.prepare('DELETE FROM sessions WHERE id = ?'),
  deleteSessionParticipants: db.prepare('DELETE FROM participants WHERE session_id = ?'),
  deleteSessionRounds: db.prepare('DELETE FROM rounds WHERE session_id = ?'),
  deleteSessionPairs: db.prepare(`
    DELETE FROM pairs WHERE round_id IN (SELECT id FROM rounds WHERE session_id = ?)
  `),
  deleteSessionResponses: db.prepare(`
    DELETE FROM responses WHERE pair_id IN (
      SELECT p.id FROM pairs p JOIN rounds r ON p.round_id = r.id WHERE r.session_id = ?
    )
  `),
  deleteSessionResults: db.prepare(`
    DELETE FROM results WHERE pair_id IN (
      SELECT p.id FROM pairs p JOIN rounds r ON p.round_id = r.id WHERE r.session_id = ?
    )
  `),

  // Participants
  addParticipant: db.prepare(
    'INSERT INTO participants (id, session_id, display_name, socket_id) VALUES (?, ?, ?, ?)'
  ),
  getParticipant: db.prepare('SELECT * FROM participants WHERE id = ?'),
  getParticipantBySocket: db.prepare('SELECT * FROM participants WHERE socket_id = ?'),
  getSessionParticipants: db.prepare(
    'SELECT * FROM participants WHERE session_id = ? AND connected = 1'
  ),
  getAllSessionParticipants: db.prepare(
    'SELECT * FROM participants WHERE session_id = ?'
  ),
  updateParticipantSocket: db.prepare(
    'UPDATE participants SET socket_id = ?, connected = 1 WHERE id = ?'
  ),
  disconnectParticipant: db.prepare(
    'UPDATE participants SET connected = 0, socket_id = NULL WHERE socket_id = ?'
  ),

  // Rounds
  createRound: db.prepare(
    'INSERT INTO rounds (id, session_id, round_number, image_id, status, started_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\'))'
  ),
  getRound: db.prepare('SELECT * FROM rounds WHERE id = ?'),
  getSessionRounds: db.prepare(
    'SELECT * FROM rounds WHERE session_id = ? ORDER BY round_number'
  ),
  getCurrentRound: db.prepare(
    'SELECT * FROM rounds WHERE session_id = ? AND status = \'active\' LIMIT 1'
  ),
  updateRoundStatus: db.prepare('UPDATE rounds SET status = ?, completed_at = datetime(\'now\') WHERE id = ?'),

  // Pairs
  createPair: db.prepare(
    'INSERT INTO pairs (id, round_id, participant_a, participant_b, pairing_algorithm) VALUES (?, ?, ?, ?, ?)'
  ),
  getPair: db.prepare('SELECT * FROM pairs WHERE id = ?'),
  getRoundPairs: db.prepare('SELECT * FROM pairs WHERE round_id = ?'),
  getPairForParticipant: db.prepare(
    'SELECT * FROM pairs WHERE round_id = ? AND (participant_a = ? OR participant_b = ?)'
  ),

  // Responses
  addResponse: db.prepare(
    'INSERT INTO responses (id, pair_id, participant_id, value) VALUES (?, ?, ?, ?)'
  ),
  getPairResponses: db.prepare('SELECT * FROM responses WHERE pair_id = ?'),
  getResponseCount: db.prepare('SELECT COUNT(*) as count FROM responses WHERE pair_id = ?'),

  // Results
  addResult: db.prepare(
    'INSERT INTO results (id, pair_id, matched, difference, value_a, value_b) VALUES (?, ?, ?, ?, ?, ?)'
  ),
  getRoundResults: db.prepare(
    'SELECT r.* FROM results r JOIN pairs p ON r.pair_id = p.id WHERE p.round_id = ?'
  ),
  getSessionResults: db.prepare(`
    SELECT r.*, p.participant_a, p.participant_b, p.pairing_algorithm,
           rd.round_number, rd.image_id
    FROM results r
    JOIN pairs p ON r.pair_id = p.id
    JOIN rounds rd ON p.round_id = rd.id
    WHERE rd.session_id = ?
    ORDER BY rd.round_number
  `),
};

export default db;
