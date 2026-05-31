import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'

// StrictMode intentionally disabled: KaPlay (used by WorldMap) maintains
// internal singleton state that survives `quit()`, so StrictMode's
// double-effect-run logs "calling kaplay() multiple times" and corrupts
// the WebGL context. This is the standard workaround for canvas-based game
// libraries (Phaser, three.js scenes, etc. have the same impedance mismatch).
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
