import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function JoinPage() {
  const [sessionCode, setSessionCode] = useState('');
  const navigate = useNavigate();

  function handleJoin(e) {
    e.preventDefault();
    if (sessionCode.trim()) {
      navigate(`/session/${sessionCode.trim()}`);
    }
  }

  return (
    <div className="center-page">
      <div className="card max-w-md w-full">
        <div className="page-header">
          <h1>Coordination Experiment</h1>
          <p>Enter the session code provided by your experiment host</p>
        </div>

        <form onSubmit={handleJoin}>
          <div className="form-group">
            <label className="label">Session Code</label>
            <input
              type="text"
              value={sessionCode}
              onChange={(e) => setSessionCode(e.target.value)}
              placeholder="Enter session code..."
              autoFocus
            />
          </div>

          <button type="submit" className="btn btn-primary w-full" disabled={!sessionCode.trim()}>
            Join Experiment
          </button>
        </form>
      </div>
    </div>
  );
}
