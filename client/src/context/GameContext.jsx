import { createContext, useContext, useReducer } from 'react';

const GameContext = createContext();

const initialState = {
  sessionId: null,
  participantId: null,
  participantCount: 0,
  stage: 'join', // join | lobby | playing | feedback | ended
  currentRound: null,
  pairId: null,
  imageId: null,
  roundTimer: 0,
  feedbackTimer: 0,
  feedback: null,
  hasSubmitted: false,
};

function gameReducer(state, action) {
  switch (action.type) {
    case 'JOINED':
      return {
        ...state,
        sessionId: action.sessionId,
        participantId: action.participantId,
        participantCount: action.participantCount,
        stage: 'lobby',
      };
    case 'PARTICIPANT_COUNT':
      return { ...state, participantCount: action.count };
    case 'ROUND_START':
      return {
        ...state,
        stage: 'playing',
        currentRound: action.roundNumber,
        pairId: action.pairId,
        imageId: action.imageId,
        roundTimer: action.roundTimer || 0,
        feedback: null,
        hasSubmitted: false,
      };
    case 'SUBMITTED':
      return { ...state, hasSubmitted: true };
    case 'FEEDBACK':
      return { ...state, stage: 'feedback', feedback: action.feedback };
    case 'FEEDBACK_TIMER':
      return { ...state, feedbackTimer: action.feedbackTimer || 0 };
    case 'PARTNER_DISCONNECTED':
      return { ...state, stage: 'feedback', feedback: { matched: false, partnerDisconnected: true } };
    case 'UNPAIRED':
      return { ...state, stage: 'feedback', feedback: { unpaired: true }, currentRound: action.roundNumber };
    case 'SESSION_ENDED':
      return { ...state, stage: 'ended' };
    case 'SESSION_LOCKED':
      return { ...state, stage: 'lobby' };
    case 'RECONNECTED':
      return { ...state, ...action.data };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  return (
    <GameContext.Provider value={{ state, dispatch }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used within a GameProvider');
  return context;
}
