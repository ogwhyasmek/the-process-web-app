import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';
// The pre-trade pages ship in the main bundle so they open instantly —
// they're what gets used under time pressure.
import { Cockpit } from './pages/Cockpit';
import { Guardrail } from './pages/Guardrail';

// Everything else loads on first visit. Analytics and the Stock Analyzer
// carry the charting library (Recharts), the bulk of the bundle.
const TradeLog = lazy(() => import('./pages/TradeLog').then((m) => ({ default: m.TradeLog })));
const Analytics = lazy(() => import('./pages/Analytics').then((m) => ({ default: m.Analytics })));
const Screener = lazy(() => import('./pages/Screener').then((m) => ({ default: m.Screener })));
const Analyzer = lazy(() => import('./pages/Analyzer').then((m) => ({ default: m.Analyzer })));
const Reference = lazy(() => import('./pages/Reference').then((m) => ({ default: m.Reference })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));

/**
 * Route map (spec §5). Every page shares the shell — nav, ticker,
 * and the local data layer — so features stay ≤2 clicks from anywhere.
 */
export default function App() {
  return (
    <AppShell>
      {/* Pages render nothing until their data loads anyway, so an empty
          fallback avoids a flash of loading text on fast connections. */}
      <Suspense fallback={null}>
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
      </Suspense>
    </AppShell>
  );
}
