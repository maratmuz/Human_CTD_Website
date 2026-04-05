# Human Coordination Experiment

A real-time web-based behavioral experiment platform inspired by Centola & Baronchelli's "The Spontaneous Emergence of Conventions" (2015). Participants join a session, get paired according to network topologies, view an image, and independently input values (0-1000). The system checks if pairs converge within a tolerance and tracks convergence across rounds.

Participants are fully anonymous — no names, no IDs, no information about network structure. The admin controls everything: algorithm selection, image, tolerance, timers, and when to stop.

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express + Socket.IO |
| Frontend | React 19 (Vite) |
| Database | SQLite (via `better-sqlite3`) |

## Quick Start

```bash
# Install all dependencies
npm run install:all

# Run in development (server on :3000, client on :5173)
npm run dev

# Build & run in production
npm run build
NODE_ENV=production npm start
```

## How It Works

### Admin Workflow
1. Go to `/admin`, login with password (default: `admin`)
2. Create a session: choose algorithm, image, tolerance, and timers
3. Share the participant link or session code with participants
4. Start rounds — participants are automatically paired and see the image
5. Monitor live progress: match rates, pair completion, value distribution histogram
6. Continue running rounds until convergence is observed, then end the experiment
7. Export all data as CSV

### Participant Experience
1. Enter the session code on the homepage or use the direct link
2. **Waiting room** — see how many participants are connected
3. **Playing** — see the image, enter a value (0-1000), submit before the timer expires
4. **Feedback** — see whether they matched or not, wait for the next round
5. Repeat until the admin ends the experiment

### Timers
- **Round Timer** (default 20s): How long participants have to submit a value. Auto-submits when time runs out. Set to 0 for unlimited (admin manually advances).
- **Feedback Timer** (default 5s): How long the feedback screen shows before the next round auto-starts. Set to 0 for manual advancement only.
- Admin always has manual "Start Round" and "Force End Round" buttons regardless of timer settings.

## Pairing Algorithms

| Algorithm | Description |
|-----------|-------------|
| **Spatial Network** | 1D ring lattice with degree 4. Each participant connects to their 2 nearest neighbors on each side. Creates regional clusters that may develop competing conventions. |
| **Random Network** | Random regular graph with degree 4. Each participant has exactly 4 random connections. Produces entrenched local groups similar to spatial networks. |
| **Homogeneous Mixing** | Complete graph — any participant can be paired with any other each round. No stable local clusters; enables a single convention to snowball to universal adoption. |

## Environment Variables

| Variable  | Default | Description |
|-----------|---------|-------------|
| `PORT`    | `3000`  | Server port |
| `ADMIN_PASSWORD`    | `admin`     | Password for the admin dashboard |
| `NODE_ENV`| `development` | Set to `production` to serve client from server |

## Images

Place experiment images in the `images/` directory (jpg, png, gif, webp, svg). The admin selects one image per session. If the image file is missing, participants see a placeholder.

## Data Export

- **CSV**: Download from the admin panel "Export CSV" button
- **JSON**: `GET /api/export/sessions/:id/json`
- **Direct SQL**: `sqlite3 data/experiment.db "SELECT * FROM results;"`

All data (sessions, participants, rounds, pairs, responses, results) is saved to SQLite at `data/experiment.db`.

## Data Persistence

- **Participant disconnects** — Marked as disconnected; any active pair is resolved as "no match". They can reconnect by refreshing.
- **Admin closes tab** — Session data remains. Reopen `/admin` to continue.
- **Server restarts** — Database survives. Participants refresh to reconnect.

## Deployment

```bash
npm run build
NODE_ENV=production ADMIN_PASSWORD=your_password npm start
```

Works on any Node.js hosting (Railway, Render, VPS, etc.) with WebSocket support.
