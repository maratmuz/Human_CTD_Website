import { createContext, useContext, useReducer } from 'react';

const GameContext = createContext();

const initialState = {
  sessionId: null,
  participantId: null,
  displayName: null,
  participantCount: 0,
  stage: 'join', // join | lobby | playing | feedback | waiting | results | ended
  currentRound: null,
  pairId: null,
  partnerId: null,
  partnerName: null,
  imageId: null,
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
        displayName: action.displayName,
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
        partnerId: action.partnerId,
        partnerName: action.partnerName,
        imageId: action.imageId,
        feedback: null,
        hasSubmitted: false,
      };
    case 'SUBMITTED':
      return { ...state, hasSubmitted: true };
    case 'FEEDBACK':
      return { ...state, stage: 'feedback', feedback: action.feedback };
    case 'ROUND_ENDED':
      return { ...state, stage: 'waiting' };
    case 'UNPAIRED':
      return { ...state, stage: 'waiting', currentRound: action.roundNumber };
    case 'SESSION_ENDED':
      return { ...state, stage: 'ended' };
    case 'SESSION_LOCKED':
      return { ...state, stage: 'lobby' };
    case 'RECONNECTED':
      return {
        ...state,
        ...action.data,
      };
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
