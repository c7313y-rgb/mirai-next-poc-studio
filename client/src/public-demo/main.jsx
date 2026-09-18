import { createRoot } from 'react-dom/client';
import { ToastProvider } from '../ui.jsx';
import PublicDemo from './PublicDemo.jsx';
import '../styles.css';
import './public-demo.css';

createRoot(document.getElementById('root')).render(<ToastProvider><PublicDemo /></ToastProvider>);
