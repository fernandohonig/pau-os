import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles/theme.css';
import { App } from './App';
import { SessionProvider } from './session';
import { LangProvider } from './lang';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <LangProvider>
        <SessionProvider>
          <App />
        </SessionProvider>
      </LangProvider>
    </BrowserRouter>
  </StrictMode>,
);
