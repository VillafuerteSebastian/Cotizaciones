import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { UIProvider } from './components/UIProvider.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <UIProvider>
      <App />
    </UIProvider>
  </React.StrictMode>
);
