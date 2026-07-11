import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Cockpit } from './pages/Cockpit';
import { Guardrail } from './pages/Guardrail';
import { TradeLog } from './pages/TradeLog';
import { Analytics } from './pages/Analytics';
import { Screener } from './pages/Screener';
import { Analyzer } from './pages/Analyzer';
import { Reference } from './pages/Reference';
import { Settings } from './pages/Settings';

/**
 * Route map (spec §5). Every page shares the shell — nav, ticker,
 * and the local data layer — so features stay ≤2 clicks from anywhere.
 */
export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/cockpit" replace />} />
        <Route path="/cockpit" element={<Cockpit />} />
        <Route path="/guardrail" element={<Guardrail />} />
        <Route path="/log" element={<TradeLog />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/screener" element={<Screener />} />
        <Route path="/analyzer" element={<Analyzer />} />
        <Route path="/reference" element={<Reference />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/cockpit" replace />} />
      </Routes>
    </AppShell>
  );
}
