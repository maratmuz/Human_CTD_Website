import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import { useGame } from '../context/GameContext';

export default function ParticipantPage() {
  const { sessionId } = useParams();
  const { socket, connected } = useSocket();
  const { state, dispatch } = useGame();

  const [value, setValue] = useState(500);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const countdownRef = useRef(null);

  // Clear any running countdown interval
  function clearCountdown() {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setCountdown(null);
  }

  // Start a countdown from `seconds`; calls `onExpire` when done
  function startCountdown(seconds, onExpire) {
    clearCountdown();
    if (seconds <= 0) return;
    setCountdown(seconds);
    const startTime = Date.now();
    countdownRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = seconds - elapsed;
      if (remaining <= 0) {
        clearCountdown();
        onExpire?.();
      } else {
        setCountdown(remaining);
      }
    }, 250);
  }

  // Auto-submit when round timer expires
  const autoSubmitRef = useRef(null);
  autoSubmitRef.current = () => {
    if (state.hasSubmitted || submitting) return;
    // Auto-submit current value
    if (!socket || !state.pairId) return;
    setSubmitting(true);
    socket.emit('response:submit', { pairId: state.pairId, value: Math.round(value) }, (response) => {
      setSubmitting(false);
      if (!response?.error) {
        dispatch({ type: 'SUBMITTED' });
      }
    });
  };

  // Set up socket listeners
  useEffect(() => {
    if (!socket) return;

    socket.on('participants:count', (count) => {
      dispatch({ type: 'PARTICIPANT_COUNT', count });
    });

    socket.on('round:start', (data) => {
      setValue(500); // reset slider for new round
      dispatch({
        type: 'ROUND_START',
        roundNumber: data.roundNumber,
        pairId: data.pairId,
        imageId: data.imageId,
        roundTimer: data.roundTimer,
      });
    });

    socket.on('round:feedback', (feedback) => {
      clearCountdown();
      dispatch({ type: 'FEEDBACK', feedback });
    });

    socket.on('round:feedback-timer', ({ feedbackTimer }) => {
      dispatch({ type: 'FEEDBACK_TIMER', feedbackTimer });
      if (feedbackTimer > 0) {
        startCountdown(feedbackTimer, null); // purely visual, server auto-advances
      }
    });

    socket.on('round:unpaired', (data) => {
      clearCountdown();
      dispatch({ type: 'UNPAIRED', roundNumber: data.roundNumber });
    });

    socket.on('session:ended', () => {
      clearCountdown();
      dispatch({ type: 'SESSION_ENDED' });
    });

    socket.on('session:locked', () => {
      dispatch({ type: 'SESSION_LOCKED' });
    });

    socket.on('partner:submitted', () => {
      // Partner has submitted, we're still waiting
    });

    socket.on('partner:disconnected', () => {
      clearCountdown();
      dispatch({ type: 'PARTNER_DISCONNECTED' });
    });

    return () => {
      socket.off('participants:count');
      socket.off('round:start');
      socket.off('round:feedback');
      socket.off('round:feedback-timer');
      socket.off('round:unpaired');
      socket.off('session:ended');
      socket.off('session:locked');
      socket.off('partner:submitted');
      socket.off('partner:disconnected');
    };
  }, [socket, dispatch]);

  // Start round countdown when entering playing stage
  useEffect(() => {
    if (state.stage === 'playing' && state.roundTimer > 0 && !state.hasSubmitted) {
      startCountdown(state.roundTimer, () => {
        autoSubmitRef.current?.();
      });
    }
    if (state.stage !== 'playing') {
      // Don't clear here — feedback timer might be running
    }
  }, [state.stage, state.roundTimer, state.hasSubmitted]);

  // Clear countdown on submit
  useEffect(() => {
    if (state.hasSubmitted && state.stage === 'playing') {
      clearCountdown();
    }
  }, [state.hasSubmitted, state.stage]);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearCountdown();
  }, []);

  // Auto-join or reconnect when socket connects
  useEffect(() => {
    if (!socket || !connected || state.stage !== 'join') return;

    // Try to reconnect first
    const stored = sessionStorage.getItem(`participant:${sessionId}`);
    if (stored) {
      const { participantId } = JSON.parse(stored);
      socket.emit('session:reconnect', { sessionId, participantId }, (response) => {
        if (response?.reconnected) {
          dispatch({
            type: 'JOINED',
            sessionId,
            participantId,
            participantCount: 0,
          });
          if (response.activeRound) {
            dispatch({
              type: 'ROUND_START',
              roundNumber: response.activeRound.roundNumber,
              pairId: response.activeRound.pairId,
              imageId: response.activeRound.imageId,
              roundTimer: 0, // don't restart timer on reconnect
            });
            if (response.activeRound.hasSubmitted) {
              dispatch({ type: 'SUBMITTED' });
            }
          }
        } else {
          joinSession();
        }
      });
    } else {
      joinSession();
    }
  }, [socket, connected, sessionId, state.stage]);

  function joinSession() {
    if (!socket) return;
    setError('');
    socket.emit('session:join', { sessionId }, (response) => {
      if (response?.error) {
        setError(response.error);
      } else {
        sessionStorage.setItem(
          `participant:${sessionId}`,
          JSON.stringify({ participantId: response.participantId })
        );
        dispatch({
          type: 'JOINED',
          sessionId,
          participantId: response.participantId,
          participantCount: response.participantCount,
        });
      }
    });
  }

  const handleSubmit = useCallback(() => {
    if (!socket || submitting || state.hasSubmitted) return;
    setSubmitting(true);
    clearCountdown();

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

  // Connecting / joining
  if (state.stage === 'join') {
    return (
      <div className="center-page">
        <div className="card max-w-md w-full text-center">
          <h2>Joining Experiment...</h2>
          {error ? (
            <p style={{ marginTop: 12, color: 'var(--danger)' }}>{error}</p>
          ) : (
            <p style={{ marginTop: 12, color: 'var(--text-muted)' }}>
              {connected ? 'Connecting to session...' : 'Establishing connection...'}
            </p>
          )}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <p style={{ color: 'var(--text-muted)' }}>
              Round {state.currentRound}
            </p>
            {countdown !== null && !state.hasSubmitted && (
              <span className={`countdown ${countdown <= 5 ? 'countdown-urgent' : ''}`}>
                {countdown}s
              </span>
            )}
          </div>

          <img
            src={`/images/${state.imageId}`}
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

  // Feedback — show match result (this is now the resting state between rounds)
  if (state.stage === 'feedback') {
    const { feedback } = state;

    // Unpaired this round
    if (feedback?.unpaired) {
      return (
        <div className="center-page">
          <div className="card max-w-md w-full text-center">
            <p style={{ color: 'var(--text-muted)' }}>
              You were not paired this round. Waiting for the next round...
            </p>
            {countdown !== null && (
              <p style={{ marginTop: 12, fontSize: 14, color: 'var(--text-muted)' }}>
                Next round in {countdown}s
              </p>
            )}
          </div>
        </div>
      );
    }

    // Partner disconnected
    if (feedback?.partnerDisconnected) {
      return (
        <div className="center-page">
          <div className="card max-w-md w-full text-center">
            <p style={{ color: 'var(--text-muted)' }}>
              Your partner disconnected. Waiting for the next round...
            </p>
            {countdown !== null && (
              <p style={{ marginTop: 12, fontSize: 14, color: 'var(--text-muted)' }}>
                Next round in {countdown}s
              </p>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="center-page">
        <div className={`card max-w-md w-full feedback-card ${feedback.matched ? 'matched' : 'not-matched'}`}>
          <div className="feedback-icon">{feedback.matched ? '✓' : '✗'}</div>
          <h2>{feedback.matched ? 'Match!' : 'No Match'}</h2>

          <p style={{ marginTop: 24, color: 'var(--text-muted)' }}>
            Waiting for the next round...
          </p>
          {countdown !== null && (
            <p style={{ marginTop: 8, fontSize: 14, color: 'var(--text-muted)' }}>
              Next round in {countdown}s
            </p>
          )}
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
            Thank you for participating!
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
