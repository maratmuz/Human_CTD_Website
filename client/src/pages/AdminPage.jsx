import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';

const API_BASE = '';

export default function AdminPage() {
  const { sessionId: urlSessionId } = useParams();
  const navigate = useNavigate();
  const { socket, connected } = useSocket();

  const [password, setPassword] = useState(localStorage.getItem('adminPassword') || '');
  const [authenticated, setAuthenticated] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [roundProgress, setRoundProgress] = useState(null);
  const [roundStats, setRoundStats] = useState([]);
  const [error, setError] = useState('');

  // New session form
  const [newSessionName, setNewSessionName] = useState('');
  const [tolerance, setTolerance] = useState(50);
  const [feedbackMode, setFeedbackMode] = useState('match-only');
  const [pairingAlgorithm, setPairingAlgorithm] = useState('random-mixing');
  const [algorithms, setAlgorithms] = useState([]);

  const headers = { 'x-admin-password': password, 'Content-Type': 'application/json' };

  // Auth check
  const authenticate = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/sessions`, { headers });
      if (res.ok) {
        setAuthenticated(true);
        localStorage.setItem('adminPassword', password);
        const data = await res.json();
        setSessions(data);
      } else {
        setError('Invalid password');
        setAuthenticated(false);
      }
    } catch {
      setError('Server not reachable');
    }
  }, [password]);

  // Fetch algorithms
  useEffect(() => {
    fetch(`${API_BASE}/api/algorithms`)
      .then((r) => r.json())
      .then(setAlgorithms)
      .catch(() => {});
  }, []);

  // If URL has sessionId, load it after auth
  useEffect(() => {
    if (authenticated && urlSessionId) {
      loadSession(urlSessionId);
    }
  }, [authenticated, urlSessionId]);

  // Socket listeners for admin
  useEffect(() => {
    if (!socket || !activeSession) return;

    socket.emit('admin:join', { sessionId: activeSession.id }, (response) => {
      if (response) {
        setParticipants(response.participants || []);
        setRounds(response.rounds || []);
      }
    });

    socket.on('participants:update', (p) => setParticipants(p));

    socket.on('round:started', (data) => {
      setRounds((prev) => [
        ...prev,
        {
          id: data.roundId,
          round_number: data.roundNumber,
          image_id: data.imageId,
          status: 'active',
        },
      ]);
      setRoundProgress({
        totalPairs: data.pairs.length,
        completedPairs: 0,
        pairDetails: data.pairs.map((p) => ({
          pairId: p.id,
          participantA: p.a,
          participantB: p.b,
          responsesSubmitted: 0,
          completed: false,
        })),
      });
    });

    socket.on('round:progress', (progress) => {
      setRoundProgress(progress);
    });

    socket.on('round:complete', (data) => {
      setRoundStats((prev) => [...prev, data]);
      setRounds((prev) =>
        prev.map((r) => (r.id === data.roundId ? { ...r, status: 'completed' } : r))
      );
      setRoundProgress(null);
    });

    return () => {
      socket.off('participants:update');
      socket.off('round:started');
      socket.off('round:progress');
      socket.off('round:complete');
    };
  }, [socket, activeSession]);

  async function loadSession(id) {
    try {
      const res = await fetch(`${API_BASE}/api/admin/sessions/${id}`, { headers });
      const data = await res.json();
      setActiveSession(data.session);
      setParticipants(data.participants || []);
      setRounds(data.rounds || []);
      if (!urlSessionId) navigate(`/admin/${id}`);
    } catch {
      setError('Failed to load session');
    }
  }

  async function createSession() {
    try {
      const res = await fetch(`${API_BASE}/api/admin/sessions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: newSessionName || 'Experiment',
          config: {
            tolerance,
            feedbackMode,
            pairingAlgorithm,
            images: ['image1', 'image2', 'image3'],
          },
        }),
      });
      const session = await res.json();
      setSessions((prev) => [session, ...prev]);
      loadSession(session.id);
      setNewSessionName('');
    } catch {
      setError('Failed to create session');
    }
  }

  function startRound() {
    if (!socket || !activeSession) return;
    socket.emit('admin:startRound', { sessionId: activeSession.id }, (response) => {
      if (response?.error) setError(response.error);
    });
  }

  function endExperiment() {
    if (!socket || !activeSession) return;
    socket.emit('admin:endSession', { sessionId: activeSession.id }, (response) => {
      if (response?.error) setError(response.error);
      else setActiveSession((s) => ({ ...s, status: 'completed' }));
    });
  }

  async function deleteSession(id) {
    try {
      const res = await fetch(`${API_BASE}/api/admin/sessions/${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-password': password },
      });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== id));
        if (activeSession?.id === id) {
          setActiveSession(null);
          navigate('/admin');
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to delete session');
      }
    } catch (err) {
      console.error('Delete failed:', err);
      setError('Failed to delete session');
    }
  }

  // ── Login screen ──
  if (!authenticated) {
    return (
      <div className="center-page">
        <div className="card max-w-md w-full">
          <div className="page-header">
            <h1>Admin Login</h1>
            <p>Enter the admin password to manage experiments</p>
          </div>

          {error && <p style={{ color: 'var(--danger)', marginBottom: 16 }}>{error}</p>}

          <div className="form-group">
            <label className="label">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && authenticate()}
              placeholder="Admin password..."
              autoFocus
            />
          </div>

          <button className="btn btn-primary w-full" onClick={authenticate}>
            Login
          </button>
        </div>
      </div>
    );
  }

  // ── Session list (no active session) ──
  if (!activeSession) {
    return (
      <div className="center-page">
        <div style={{ maxWidth: 600, width: '100%' }}>
          <div className="page-header">
            <h1>Experiment Dashboard</h1>
          </div>

          {/* Create new session */}
          <div className="card mb-16">
            <h3 style={{ marginBottom: 16 }}>Create New Session</h3>

            <div className="form-group">
              <label className="label">Session Name</label>
              <input
                type="text"
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                placeholder="e.g., Pilot Run 1"
              />
            </div>

            <div className="form-group">
              <label className="label">Pairing Algorithm</label>
              <select value={pairingAlgorithm} onChange={(e) => setPairingAlgorithm(e.target.value)}>
                {algorithms.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label} — {a.description}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="label">Tolerance (0-1000)</label>
                <input
                  type="number"
                  value={tolerance}
                  onChange={(e) => setTolerance(Number(e.target.value))}
                  min={0}
                  max={1000}
                />
              </div>

              <div className="form-group">
                <label className="label">Feedback Mode</label>
                <select value={feedbackMode} onChange={(e) => setFeedbackMode(e.target.value)}>
                  <option value="match-only">Match/No Match only</option>
                  <option value="show-partner">Show partner's value</option>
                  <option value="show-all">Show all details</option>
                </select>
              </div>
            </div>

            {error && <p style={{ color: 'var(--danger)', marginBottom: 8 }}>{error}</p>}

            <button className="btn btn-primary" onClick={createSession}>
              Create Session
            </button>
          </div>

          {/* Existing sessions */}
          {sessions.length > 0 && (
            <div className="card">
              <h3 style={{ marginBottom: 12 }}>Existing Sessions</h3>
              {sessions.map((s) => (
                <div
                  key={s.id}
                  style={{
                    padding: '12px 0',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div
                    style={{ cursor: 'pointer', flex: 1 }}
                    onClick={() => loadSession(s.id)}
                  >
                    <strong>{s.name}</strong>
                    <span
                      className={`badge ${
                        s.status === 'lobby'
                          ? 'badge-info'
                          : s.status === 'playing'
                          ? 'badge-warning'
                          : 'badge-success'
                      }`}
                      style={{ marginLeft: 8 }}
                    >
                      {s.status}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
                      {s.id}
                    </span>
                  </div>
                  <button
                    className="btn btn-danger"
                    style={{ padding: '6px 12px', fontSize: 12 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Delete session "${s.name}" (${s.id})? This cannot be undone.`)) {
                        deleteSession(s.id);
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Active session dashboard ──
  const config = JSON.parse(activeSession.config || '{}');
  const activeRound = rounds.find((r) => r.status === 'active');
  const completedRounds = rounds.filter((r) => r.status === 'completed');
  const isLobby = activeSession.status === 'lobby';
  const isCompleted = activeSession.status === 'completed';

  return (
    <div className="admin-layout">
      {/* Sidebar */}
      <div className="admin-sidebar">
        <h2 style={{ fontSize: 18, marginBottom: 4 }}>{activeSession.name}</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
          Code: {activeSession.id}
        </p>

        <div style={{ marginBottom: 16 }}>
          <span
            className={`badge ${
              isCompleted ? 'badge-success' : isLobby ? 'badge-info' : 'badge-warning'
            }`}
          >
            {activeSession.status}
          </span>
        </div>

        {/* Session link for participants */}
        <div className="card" style={{ padding: 12, marginBottom: 16 }}>
          <p className="label">Participant Link</p>
          <input
            type="text"
            readOnly
            value={`${window.location.origin}/session/${activeSession.id}`}
            onClick={(e) => {
              e.target.select();
              navigator.clipboard?.writeText(e.target.value);
            }}
            style={{ fontSize: 11 }}
          />
        </div>

        {/* Config summary */}
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          <p><strong>Algorithm:</strong> {config.pairingAlgorithm}</p>
          <p><strong>Tolerance:</strong> {config.tolerance}</p>
          <p><strong>Feedback:</strong> {config.feedbackMode}</p>
        </div>

        <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid var(--border)' }} />

        {/* Participants */}
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>
          Participants ({participants.length})
        </h3>
        <ul className="participant-list">
          {participants.map((p) => (
            <li key={p.id}>
              <span>
                <span className={`connection-dot ${p.connected ? 'connected' : 'disconnected'}`} />
                {p.display_name}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {p.id.slice(0, 6)}
              </span>
            </li>
          ))}
          {participants.length === 0 && (
            <li style={{ color: 'var(--text-muted)', justifyContent: 'center' }}>
              No participants yet
            </li>
          )}
        </ul>

        <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid var(--border)' }} />

        {/* Actions */}
        <div className="flex flex-col gap-8">
          {!isCompleted && (
            <button
              className="btn btn-primary w-full"
              onClick={startRound}
              disabled={participants.length < 2 || !!activeRound}
            >
              {activeRound ? 'Round in Progress...' : `Start Round ${rounds.length + 1}`}
            </button>
          )}

          {!isCompleted && rounds.length > 0 && (
            <button className="btn btn-danger w-full" onClick={endExperiment}>
              End Experiment
            </button>
          )}

          {/* Export */}
          <a
            href={`${API_BASE}/api/export/sessions/${activeSession.id}/csv`}
            className="btn btn-success w-full"
            download
            style={{ textDecoration: 'none' }}
          >
            Export CSV
          </a>

          <button
            className="btn w-full"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
            onClick={() => {
              setActiveSession(null);
              navigate('/admin');
            }}
          >
            Back to Sessions
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="admin-main">
        <h2 style={{ marginBottom: 16 }}>
          {isCompleted
            ? 'Experiment Results'
            : activeRound
            ? `Round ${activeRound.round_number} — In Progress`
            : `Ready for Round ${rounds.length + 1}`}
        </h2>

        {error && (
          <div className="card" style={{ background: '#fef2f2', borderColor: 'var(--danger)', marginBottom: 16 }}>
            <p style={{ color: 'var(--danger)' }}>{error}</p>
          </div>
        )}

        {/* Stats overview */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{participants.length}</div>
            <div className="stat-label">Participants</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{completedRounds.length}</div>
            <div className="stat-label">Rounds Done</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {roundStats.length > 0
                ? `${Math.round(roundStats[roundStats.length - 1].stats.matchRate * 100)}%`
                : '—'}
            </div>
            <div className="stat-label">Last Match Rate</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {roundStats.length > 0
                ? roundStats[roundStats.length - 1].stats.avgDifference
                : '—'}
            </div>
            <div className="stat-label">Last Avg Diff</div>
          </div>
        </div>

        {/* Active round progress */}
        {roundProgress && (
          <div className="card mt-16">
            <h3>Round Progress</h3>
            <div className="progress-bar mt-16">
              <div
                className="progress-bar-fill"
                style={{
                  width: `${(roundProgress.completedPairs / roundProgress.totalPairs) * 100}%`,
                }}
              />
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {roundProgress.completedPairs} / {roundProgress.totalPairs} pairs completed
            </p>

            <table style={{ width: '100%', marginTop: 16, fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '8px 0' }}>Pair</th>
                  <th>Responses</th>
                  <th>Status</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {roundProgress.pairDetails?.map((pair) => (
                  <tr key={pair.pairId} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 0' }}>
                      {pair.participantA?.slice(0, 6)} ↔ {pair.participantB?.slice(0, 6)}
                    </td>
                    <td>{pair.responsesSubmitted}/2</td>
                    <td>
                      <span
                        className={`badge ${
                          pair.completed
                            ? 'badge-success'
                            : pair.responsesSubmitted > 0
                            ? 'badge-warning'
                            : 'badge-info'
                        }`}
                      >
                        {pair.completed ? 'Done' : pair.responsesSubmitted > 0 ? 'Partial' : 'Pending'}
                      </span>
                    </td>
                    <td>
                      {pair.completed && (
                        <span className={pair.matched ? 'badge badge-success' : 'badge badge-danger'}>
                          {pair.matched ? 'Match' : `Diff: ${pair.difference}`}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Round history */}
        {roundStats.length > 0 && (
          <div className="card mt-16">
            <h3>Round History</h3>
            <table style={{ width: '100%', marginTop: 12, fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '8px 0' }}>Round</th>
                  <th>Pairs</th>
                  <th>Matches</th>
                  <th>Match Rate</th>
                  <th>Avg Difference</th>
                </tr>
              </thead>
              <tbody>
                {roundStats.map((rs) => (
                  <tr key={rs.roundId} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 0' }}>#{rs.roundNumber}</td>
                    <td>{rs.stats.totalPairs}</td>
                    <td>{rs.stats.matches}</td>
                    <td>{Math.round(rs.stats.matchRate * 100)}%</td>
                    <td>{rs.stats.avgDifference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Empty state */}
        {!roundProgress && roundStats.length === 0 && !isCompleted && (
          <div className="card mt-16 text-center" style={{ padding: 48 }}>
            <p style={{ color: 'var(--text-muted)' }}>
              {participants.length < 2
                ? 'Waiting for at least 2 participants to join...'
                : 'Ready to start. Click "Start Round" in the sidebar.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
