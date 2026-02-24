# Coordination Experiment Website

A real-time web-based behavioral experiment inspired by Centola & Baronchelli's "The Spontaneous Emergence of Conventions" (2015). Participants join a session, get paired according to configurable network topologies, view images, and independently input values (0–1000). The system checks if pairs converge within a tolerance, tracks rounds, and compiles convergence data.

Supports 50–200+ participants, both in-person and remote, with a live admin dashboard.

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express + Socket.IO |
| Frontend | React (Vite) |
| Database | SQLite (via `better-sqlite3`) |
| Monorepo | Single repo, `client/` + `server/` folders |

## Quick Start

```bash
# Install all dependencies
npm run install:all

# Run in development (server on :3000, client on :5173)
npm run dev

# Build for production
npm run build

# Run in production (serves client from server)
npm start
```

## How to Use

1. **Admin** — Go to `/admin`, login with password `admin` (configurable via `ADMIN_PASSWORD` env var)
2. **Create a session** — Choose pairing algorithm, tolerance, and feedback mode
3. **Share the link** — Participants go to `/session/<CODE>` or enter the 6-character session code on the homepage
4. **Start rounds** — Admin clicks "Start Round"; participants see the image and input values
5. **Monitor** — Admin sees live progress: pairs completed, match rates, average differences
6. **Export data** — CSV download from the admin panel, or use `python3 analyze.py`

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `ADMIN_PASSWORD` | `admin` | Password for the admin dashboard |
| `NODE_ENV` | `development` | Set to `production` to serve client from server |

See `.env.example` for a template.

## Pairing Algorithms

| Algorithm | Description |
|-----------|-------------|
| **Round Robin** | Everyone plays everyone over N-1 rounds (classic tournament scheduling) |
| **Random Mixing** | Random partner each round (Centola's random mixing condition) |
| **Geographic Lattice** | Ring topology — participants play with their nearest neighbors |
| **Small World (Watts-Strogatz)** | Lattice with random shortcuts, configurable rewiring probability beta |
| **Custom** | Edit `server/pairings/custom.js` to implement your own |

Each algorithm implements the same interface: `generatePairings(participants, roundNumber, config) → [{a, b}]`. To add a new algorithm, duplicate `custom.js` and register it in `server/pairingEngine.js`.

## Images

Place experiment images in the `images/` directory as `image1.jpg`, `image2.jpg`, `image3.jpg`, etc. The admin config specifies which image IDs to use; rounds cycle through them.

If an image file is missing, participants see a placeholder with the image ID displayed.

## Data Analysis

The SQLite database is stored at `data/experiment.db`. You can copy this file for offline analysis in Python, R, or any SQLite-compatible tool.

### Python Analyzer

```bash
# Overview of all sessions
python3 analyze.py

# Detailed view of a specific session (round-by-round, convergence analysis)
python3 analyze.py SESSION_ID

# Export session data to CSV files (saved to exports/ folder)
python3 analyze.py --export SESSION_ID
```

### Direct SQL

```bash
sqlite3 data/experiment.db "SELECT * FROM sessions;"
sqlite3 data/experiment.db "SELECT * FROM participants;"
sqlite3 data/experiment.db "SELECT * FROM results JOIN pairs ON results.pair_id = pairs.id;"
```

### REST API Export

- `GET /api/export/sessions/:id/json` — Full session data as JSON
- `GET /api/export/sessions/:id/csv` — Results as CSV
- `GET /api/export/sessions/:id/participants/csv` — Participant list as CSV

## Data Persistence

All data persists in the SQLite database file (`data/experiment.db`):

- **Participant closes tab** — Marked as disconnected, data stays. They can reconnect by refreshing.
- **Admin closes tab** — Session and data remain. Reopen `/admin` to continue.
- **Server restarts** — Database survives. Participants need to refresh to reconnect WebSocket.
- **Deletion** — Only the admin "Delete" button or deleting the `.db` file removes data.

## Deployment

**Railway** (recommended):
- Push to GitHub, connect the repo, auto-deploys
- Native WebSocket support
- Free tier with $5/month credit

**Any Node.js server:**
```bash
npm run build
NODE_ENV=production ADMIN_PASSWORD=your_password npm start
```

## Project Structure

```
Human_CTD_Website/
├── package.json                 # Root monorepo scripts (dev, build, start)
├── .env.example                 # Environment variable template
├── .gitignore                   # Ignores node_modules, data/, dist/, .env
├── analyze.py                   # Python script for data analysis & CSV export
├── images/                      # Experiment images (image1.jpg, image2.jpg, ...)
│
├── server/
│   ├── package.json             # Server dependencies (express, socket.io, better-sqlite3)
│   ├── index.js                 # Entry point: Express + Socket.IO server, all event handlers
│   ├── db.js                    # SQLite schema & prepared queries for all 6 tables
│   ├── gameLogic.js             # Core engine: start rounds, process responses, compute results
│   ├── pairingEngine.js         # Algorithm dispatcher: routes to the selected pairing module
│   ├── pairings/
│   │   ├── roundRobin.js        # Round-robin: everyone plays everyone (circle method)
│   │   ├── randomMixing.js      # Random mixing: Fisher-Yates shuffle, pair adjacent
│   │   ├── geographic.js        # Geographic lattice: ring topology, nearest neighbors
│   │   ├── smallWorld.js        # Watts-Strogatz: lattice + random shortcuts (seeded PRNG)
│   │   └── custom.js            # Template for creating your own algorithm
│   └── routes/
│       ├── admin.js             # REST API: create/list/delete sessions, update config (auth required)
│       └── export.js            # REST API: download session data as CSV or JSON
│
├── client/
│   ├── package.json             # Client dependencies (react, react-router-dom, socket.io-client)
│   ├── index.html               # HTML entry point
│   ├── vite.config.js           # Vite config with proxy to server (/api, /socket.io, /images)
│   └── src/
│       ├── main.jsx             # React entry point, renders <App />
│       ├── App.jsx              # Router: / (join), /session/:id (participant), /admin (dashboard)
│       ├── App.css              # All styles: theming, components, layouts, game UI, admin dashboard
│       ├── index.css             # Minimal (styles are in App.css)
│       ├── context/
│       │   └── GameContext.jsx   # Game state: useReducer tracking stage, round, pair, feedback
│       ├── hooks/
│       │   └── useSocket.js     # Socket.IO connection hook with auto-reconnection
│       └── pages/
│           ├── JoinPage.jsx     # Landing page: enter session code
│           ├── ParticipantPage.jsx  # Full participant flow: join → lobby → play → feedback → end
│           └── AdminPage.jsx    # Admin dashboard: login, create/delete sessions, monitor rounds
│
└── data/                        # Auto-created, contains experiment.db (gitignored)
```

## Database Schema

| Table | Purpose |
|-------|---------|
| `sessions` | Experiment sessions with config (algorithm, tolerance, feedback mode) and status |
| `participants` | Players with display name, connection status, and session membership |
| `rounds` | Round number, image ID, and completion status per session |
| `pairs` | Who is paired with whom in each round, and which algorithm was used |
| `responses` | Individual participant values (0–1000) submitted per pair |
| `results` | Computed outcomes: whether the pair matched, the difference, and both values |
