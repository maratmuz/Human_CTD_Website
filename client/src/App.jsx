import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { GameProvider } from './context/GameContext';
import JoinPage from './pages/JoinPage';
import ParticipantPage from './pages/ParticipantPage';
import AdminPage from './pages/AdminPage';
import './App.css';

function App() {
  return (
    <GameProvider>
      <BrowserRouter>
        <div className="app">
          <Routes>
            <Route path="/" element={<JoinPage />} />
            <Route path="/session/:sessionId" element={<ParticipantPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/:sessionId" element={<AdminPage />} />
          </Routes>
        </div>
      </BrowserRouter>
    </GameProvider>
  );
}

export default App;
