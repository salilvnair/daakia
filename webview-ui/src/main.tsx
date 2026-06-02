import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import 'highlight.js/styles/github-dark.css';
import './monaco-setup';

createRoot(document.getElementById('root')!).render(<App />);
