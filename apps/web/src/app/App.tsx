import { useMemo } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { TransactionJournalProvider } from '../capabilities/transactions/index.js';
import { LocalStorageJournal } from '../integrations/persistence/local-storage-journal.js';
import { HomePage } from '../pages/HomePage.js';
import { InspectorPage } from '../pages/InspectorPage.js';
import { SaleDetailPage } from '../pages/SaleDetailPage.js';
import './styles.css';
export function App() {
  const journal = useMemo(() => new LocalStorageJournal(), []);
  return (
    <TransactionJournalProvider journal={journal}>
      <main>
        <header>
          <div>
            <strong>MotorCove</strong>
            <span>LOCAL SANDBOX · TEST ETH ONLY</span>
          </div>
          <nav>
            <NavLink to="/">Marketplace</NavLink>
            <NavLink to="/inspector">System Inspector</NavLink>
          </nav>
        </header>
        <aside>Digital collectible demo — not real vehicle ownership.</aside>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/sales/:saleId" element={<SaleDetailPage />} />
          <Route path="/inspector" element={<InspectorPage />} />
        </Routes>
      </main>
    </TransactionJournalProvider>
  );
}
