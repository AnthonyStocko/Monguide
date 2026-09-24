import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ConfigProvider } from './context/ConfigContext.jsx';
import { initI18n } from './i18n/index.js';
import './index.css';

// La langue est chargée avant le premier rendu : pas de texte dans la mauvaise langue.
await initI18n();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ConfigProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ConfigProvider>
    </BrowserRouter>
  </React.StrictMode>
);
