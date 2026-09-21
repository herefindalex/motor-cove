import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/App.js';
import { Composition } from './app/composition.js';
const root = document.getElementById('root');
if (!root) throw new Error('Missing root element');
createRoot(root).render(
  <StrictMode>
    <Composition>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Composition>
  </StrictMode>,
);
