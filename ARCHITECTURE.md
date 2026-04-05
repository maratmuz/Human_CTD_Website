# Architecture & File Reference

This document explains the purpose of every file in the repository.

## Root

| File | Purpose |
|------|---------|
| `package.json` | Monorepo scripts: `dev` (runs server + client), `build`, `start`, `install:all` |
| `README.md` | Project overview, setup instructions, algorithm descriptions |
| `ARCHITECTURE.md` | This file — explains every file's role |

## Server (`server/`)

| File | Purpose |
|------|---------|
| `package.json` | Server dependencies: express, socket.io, better-sqlite3, uuid |
| `index.js` | **Entry point.** Express server + Socket.IO event handlers. Manages participant join/reconnect, admin join, round start, response submission, disconnect handling, histogram data requests. Serves static images and client build in production. |
| `db.js` | **Database layer.** Creates SQLite schema (6 tables: sessions, participants, rounds, pairs, responses, results). Exports ~30 prepared statements for all CRUD operations. WAL mode + foreign keys enabled. |
| `gameLogic.js` | **Core game engine.** `startRound()` generates pairings and notifies participants. `submitResponse()` processes values and computes match results. `checkRoundComplete()` detects when all pairs finish and manages feedback/auto-advance timers. `handleParticipantDeparture()` resolves pairs when someone disconnects. `handleRoundTimeout()` auto-resolves all incomplete pairs when round timer expires. |
| `pairingEngine.js` | **Algorithm dispatcher.** Imports the 3 pairing algorithms, caches network topologies per session, samples random maximal matchings each round using seeded shuffle + greedy matching. |

### Pairing Algorithms (`server/pairings/`)

| File | Algorithm | Network Type |
|------|-----------|-------------|
| `geographic.js` | **Spatial Network** | 1D ring lattice, degree 4. Each node connects to 2 nearest neighbors on each side. |
| `randomMixing.js` | **Random Network** | Random regular graph, degree 4. Uses configuration model with seeded PRNG. Falls back to greedy edge selection. |
| `homogeneous.js` | **Homogeneous Mixing** | Complete graph. Every participant can be paired with any other. |

All algorithms export `buildNetwork(participants, config) → [[i, j], ...]` (edge list of index pairs) and a `meta` object with name/label/description.

### Routes (`server/routes/`)

| File | Purpose |
|------|---------|
| `admin.js` | REST API for session management. Create/list/get/update/delete sessions. Password-protected via `x-admin-password` header. |
| `export.js` | Data export endpoints. CSV and JSON export of session results and participant lists. |

## Client (`client/src/`)

| File | Purpose |
|------|---------|
| `main.jsx` | React entry point, renders `<App />` |
| `App.jsx` | Router setup: `/` (JoinPage), `/session/:id` (ParticipantPage), `/admin` (AdminPage) |
| `App.css` | All styles: CSS variables for theming, card/button/badge components, game UI, admin layout, histogram, countdown timer |
| `index.css` | Minimal base styles |

### Context & Hooks

| File | Purpose |
|------|---------|
| `context/GameContext.jsx` | Game state management via `useReducer`. Tracks: stage (join/lobby/playing/feedback/ended), current round, pair ID, image, timers, feedback, submission status. |
| `hooks/useSocket.js` | Socket.IO connection hook. Auto-connects on mount with reconnection support. Returns `{ socket, connected }`. |

### Pages

| File | Purpose |
|------|---------|
| `pages/JoinPage.jsx` | Landing page. Participant enters 6-character session code to join. |
| `pages/ParticipantPage.jsx` | Full participant experience. Stages: joining → waiting room → playing (with countdown timer) → feedback (match/no-match with countdown) → ended. No participant IDs or partner info shown. Auto-submits when round timer expires. |
| `pages/AdminPage.jsx` | Admin dashboard. Login → create session (algorithm, image, tolerance, timers) → monitor rounds (live progress, pair table) → view histogram with adjustable bin width → round history table → export CSV. "Force End Round" and "Start Round" buttons always available. |

## Data (`data/`)

Auto-created directory containing `experiment.db` (SQLite). Gitignored. Delete this file to reset all data.

## Images (`images/`)

Experiment stimulus images. Place jpg/png/gif/webp/svg files here. The admin selects one image per session during creation.

## Database Schema

| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `sessions` | id, name, config (JSON), status | Experiment sessions with all configuration |
| `participants` | id, session_id, socket_id, connected | Anonymous participants with connection tracking |
| `rounds` | id, session_id, round_number, image_id, status | Round lifecycle tracking |
| `pairs` | id, round_id, participant_a, participant_b, pairing_algorithm | Who was paired each round |
| `responses` | id, pair_id, participant_id, value | Individual submitted values (0-1000) |
| `results` | id, pair_id, matched, difference, value_a, value_b | Computed match outcomes |

## Data Flow

1. Admin creates session → stored in `sessions` table with JSON config
2. Participants join → stored in `participants` table, Socket.IO room joined
3. Admin starts round → `gameLogic.startRound()` calls `pairingEngine.generatePairings()` → pairs stored in DB → each participant notified via Socket.IO
4. Participants submit values → `gameLogic.submitResponse()` stores response, computes result when both partners submit
5. Round completes → stats emitted to admin, feedback timer starts, next round auto-starts (or waits for admin)
6. Admin ends experiment → all participants notified, session marked complete
