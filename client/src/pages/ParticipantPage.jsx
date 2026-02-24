import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import { useGame } from '../context/GameContext';

export default function ParticipantPage() {
  const { sessionId } = useParams();
  const { socket, connected } = useSocket();
  const { state, dispatch } = useGame();

  const [displayName, setDisplayName] = useState('');
  const [value, setValue] = useState(500);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Set up socket listeners
  useEffect(() => {
    if (!socket) return;

    socket.on('participants:count', (count) => {
      dispatch({ type: 'PARTICIPANT_COUNT', count });
    });

    socket.on('round:start', (data) => {
      dispatch({
        type: 'ROUND_START',
        roundNumber: data.roundNumber,
        pairId: data.pairId,
        partnerId: data.partnerId,
        partnerName: data.partnerName,
        imageId: data.imageId,
      });
    });

    socket.on('round:feedback', (feedback) => {
      dispatch({ type: 'FEEDBACK', feedback });
    });

    socket.on('round:ended', () => {
      dispatch({ type: 'ROUND_ENDED' });
    });

    socket.on('round:unpaired', (data) => {
      dispatch({ type: 'UNPAIRED', roundNumber: data.roundNumber });
    });

    socket.on('session:ended', () => {
      dispatch({ type: 'SESSION_ENDED' });
    });

    socket.on('session:locked', () => {
      dispatch({ type: 'SESSION_LOCKED' });
    });

    socket.on('partner:submitted', () => {
      // Partner has submitted, we're still waiting
    });

    return () => {
      socket.off('participants:count');
      socket.off('round:start');
      socket.off('round:feedback');
      socket.off('round:ended');
      socket.off('round:unpaired');
      socket.off('session:ended');
      socket.off('session:locked');
      socket.off('partner:submitted');
    };
  }, [socket, dispatch]);

  // Try to reconnect if we have stored participant data
  useEffect(() => {
    if (!socket || !connected) return;
    const stored = sessionStorage.getItem(`participant:${sessionId}`);
    if (stored) {
      const { participantId, displayName: storedName } = JSON.parse(stored);
      socket.emit('session:reconnect', { sessionId, participantId }, (response) => {
        if (response?.reconnected) {
          dispatch({
            type: 'JOINED',
            sessionId,
            participantId,
            displayName: storedName,
            participantCount: 0,
          });
          if (response.activeRound) {
            dispatch({
              type: 'ROUND_START',
              roundNumber: response.activeRound.roundNumber,
              pairId: response.activeRound.pairId,
              imageId: response.activeRound.imageId,
              partnerId: null,
              partnerName: 'Partner',
            });
            if (response.activeRound.hasSubmitted) {
              dispatch({ type: 'SUBMITTED' });
            }
          }
        }
      });
    }
  }, [socket, connected, sessionId, dispatch]);

  const handleJoin = useCallback(
    (e) => {
      e.preventDefault();
      if (!socket || !displayName.trim()) return;

      setError('');
      socket.emit('session:join', { sessionId, displayName: displayName.trim() }, (response) => {
        if (response?.error) {
          setError(response.error);
        } else {
          // Store for reconnection
          sessionStorage.setItem(
            `participant:${sessionId}`,
            JSON.stringify({
              participantId: response.participantId,
              displayName: displayName.trim(),
            })
          );
          dispatch({
            type: 'JOINED',
            sessionId,
            participantId: response.participantId,
            displayName: displayName.trim(),
            participantCount: response.participantCount,
          });
        }
      });
    },
    [socket, sessionId, displayName, dispatch]
  );

  const handleSubmit = useCallback(() => {
    if (!socket || submitting || state.hasSubmitted) return;
    setSubmitting(true);

    socket.emit('response:submit', { pairId: state.pairId, value: Math.round(value) }, (response) => {
      setSubmitting(false);
      if (response?.error) {
        setError(response.error);
      } else {
        dispatch({ type: 'SUBMITTED' });
      }
    });
  }, [socket, state.pairId, value, submitting, state.hasSubmitted, dispatch]);

  // ── Render based on stage ──

  // Not yet joined
  if (state.stage === 'join') {
    return (
      <div className="center-page">
        <div className="card max-w-md w-full">
          <div className="page-header">
            <h1>Join Experiment</h1>
            <p>Session: {sessionId}</p>
          </div>

          {error && <p style={{ color: 'var(--danger)', marginBottom: 16 }}>{error}</p>}

          <form onSubmit={handleJoin}>
            <div className="form-group">
              <label className="label">Your Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your name..."
                autoFocus
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={!displayName.trim() || !connected}
            >
              {connected ? 'Join' : 'Connecting...'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Lobby — waiting for host to start
  if (state.stage === 'lobby') {
    return (
      <div className="center-page">
        <div className="card max-w-md w-full text-center">
          <div className="page-header">
            <h1>Waiting Room</h1>
            <p>Welcome, {state.displayName}!</p>
          </div>

          <div className="counter">{state.participantCount}</div>
          <div className="counter-label">participants connected</div>

          <p style={{ marginTop: 24, color: 'var(--text-muted)' }}>
            Waiting for the host to start the experiment...
          </p>

          <div style={{ marginTop: 16 }}>
            <span className={`connection-dot ${connected ? 'connected' : 'disconnected'}`} />
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {connected ? 'Connected' : 'Reconnecting...'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Playing — show image and input
  if (state.stage === 'playing') {
    return (
      <div className="center-page">
        <div className="card max-w-md w-full text-center">
          <p style={{ color: 'var(--text-muted)', marginBottom: 8 }}>
            Round {state.currentRound} — Paired with {state.partnerName || 'a partner'}
          </p>

          <img
            src={`/images/${state.imageId}.jpg`}
            alt="Experiment stimulus"
            className="game-image"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
            }}
          />
          <div
            style={{
              display: 'none',
              width: '100%',
              height: 250,
              background: '#f1f5f9',
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
            }}
          >
            Image: {state.imageId}
          </div>

          {!state.hasSubmitted ? (
            <>
              <div className="value-input-container">
                <label className="label">Enter a value (0 - 1000)</label>
                <input
                  type="number"
                  className="value-input"
                  min={0}
                  max={1000}
                  value={value}
                  onChange={(e) => setValue(Number(e.target.value))}
                />
              </div>

              <div className="slider-container" style={{ margin: '0 auto' }}>
                <input
                  type="range"
                  min={0}
                  max={1000}
                  value={value}
                  onChange={(e) => setValue(Number(e.target.value))}
                />
                <div className="slider-labels">
                  <span>0</span>
                  <span>250</span>
                  <span>500</span>
                  <span>750</span>
                  <span>1000</span>
                </div>
              </div>

              {error && <p style={{ color: 'var(--danger)', marginBottom: 8 }}>{error}</p>}

              <button
                className="btn btn-primary w-full mt-16"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
            </>
          ) : (
            <div style={{ marginTop: 24 }}>
              <p style={{ fontWeight: 600 }}>Your answer: {Math.round(value)}</p>
              <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>
                Waiting for your partner to submit...
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Feedback — show match result
  if (state.stage === 'feedback') {
    const { feedback } = state;
    return (
      <div className="center-page">
        <div className={`card max-w-md w-full feedback-card ${feedback.matched ? 'matched' : 'not-matched'}`}>
          <div className="feedback-icon">{feedback.matched ? '✓' : '✗'}</div>
          <h2>{feedback.matched ? 'Match!' : 'No Match'}</h2>

          {feedback.partnerValue !== undefined && (
            <p style={{ marginTop: 12 }}>
              Partner's value: <strong>{feedback.partnerValue}</strong>
            </p>
          )}
          {feedback.difference !== undefined && (
            <p style={{ marginTop: 8, color: 'var(--text-muted)' }}>
              Difference: {feedback.difference}
            </p>
          )}

          <p style={{ marginTop: 24, color: 'var(--text-muted)' }}>
            Waiting for the next round...
          </p>
        </div>
      </div>
    );
  }

  // Waiting between rounds
  if (state.stage === 'waiting') {
    return (
      <div className="center-page">
        <div className="card max-w-md w-full text-center">
          <h2>Waiting for Next Round</h2>
          <p style={{ marginTop: 12, color: 'var(--text-muted)' }}>
            {state.currentRound
              ? `Round ${state.currentRound} complete. The host will start the next round shortly.`
              : 'Please wait...'}
          </p>
        </div>
      </div>
    );
  }

  // Session ended
  if (state.stage === 'ended') {
    return (
      <div className="center-page">
        <div className="card max-w-md w-full text-center">
          <h2>Experiment Complete</h2>
          <p style={{ marginTop: 12, color: 'var(--text-muted)' }}>
            Thank you for participating, {state.displayName}!
          </p>
          <p style={{ marginTop: 8, color: 'var(--text-muted)' }}>
            The experiment has ended. Your responses have been recorded.
          </p>
        </div>
      </div>
    );
  }

  return null;
}
