/**
 * Shared application shell: sidebar navigation (slide-over on mobile),
 * the live ticker strip, and the page content area.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Ticker } from './Ticker';
import { BackupReminder } from './BackupReminder';
import './shell.css';

const NAV = [
  { to: '/cockpit', label: 'Trade Cockpit', hint: 'checklist & sizing' },
  { to: '/guardrail', label: 'Daily Guardrail', hint: "today's circuit breaker" },
  { to: '/log', label: 'Trade Log', hint: 'the permanent record' },
  { to: '/analytics', label: 'Analytics', hint: 'the honest mirror' },
  { to: '/screener', label: 'Screener', hint: 'grade the watchlist' },
  { to: '/analyzer', label: 'Stock Analyzer', hint: 'one-symbol deep read' },
  { to: '/reference', label: 'Reference', hint: 'dictionary & ruin math' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Close the mobile menu on navigation and on Escape.
  useEffect(() => setMenuOpen(false), [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    closeButtonRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const nav = (
    <nav className="shell-nav" aria-label="Primary">
      <ul>
        {NAV.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              <span className="nav-label">{item.label}</span>
              <span className="nav-hint">{item.hint}</span>
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="shell-nav-foot">
        <NavLink
          to="/settings"
          className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
        >
          <span className="nav-label">Account Settings</span>
          <span className="nav-hint">size & risk defaults</span>
        </NavLink>
      </div>
    </nav>
  );

  return (
    <div className="shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <header className="shell-top">
        <button
          className="menu-button"
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          onClick={() => setMenuOpen(true)}
        >
          <span aria-hidden="true">☰</span>
          <span className="sr-only">Open navigation</span>
        </button>
        <div className="brand brand-top">
          The<em>Process</em>
        </div>
        <Ticker />
      </header>

      <aside className="shell-side">
        <div className="brand">
          The<em>Process</em>
          <span className="brand-sub">discipline before entry</span>
        </div>
        {nav}
      </aside>

      {menuOpen && (
        <div className="mobile-nav-backdrop" onClick={() => setMenuOpen(false)}>
          <div
            id="mobile-nav"
            className="mobile-nav"
            role="dialog"
            aria-label="Navigation"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mobile-nav-head">
              <div className="brand">
                The<em>Process</em>
              </div>
              <button
                ref={closeButtonRef}
                className="menu-button"
                onClick={() => setMenuOpen(false)}
              >
                <span aria-hidden="true">✕</span>
                <span className="sr-only">Close navigation</span>
              </button>
            </div>
            {nav}
          </div>
        </div>
      )}

      <main id="main" className="shell-main">
        <BackupReminder />
        {children}
      </main>
    </div>
  );
}
