import { createRoot } from 'react-dom/client';
import App from './App';
import { useStore } from './store';
import './styles.css';
import './types';

// Dev-only handle for driving the store from the console / tests
if (import.meta.env.DEV) {
  (window as unknown as { __store: typeof useStore }).__store = useStore;
}

createRoot(document.getElementById('root')!).render(<App />);
