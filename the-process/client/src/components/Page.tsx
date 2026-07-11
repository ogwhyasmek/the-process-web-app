/**
 * Consistent page scaffold: title, one-line purpose, content sections.
 */
import type { ReactNode } from 'react';
import './page.css';

export function Page({
  title,
  lede,
  children,
}: {
  title: string;
  /** One plain-English sentence on what this page is for. */
  lede: string;
  children?: ReactNode;
}) {
  return (
    <div className="page">
      <header className="page-head">
        <h1>{title}</h1>
        <p className="page-lede">{lede}</p>
      </header>
      {children}
    </div>
  );
}

/** A quiet placeholder used while a page's milestone hasn't landed yet. */
export function ComingSoon({ milestone }: { milestone: string }) {
  return (
    <div className="coming-soon">
      <p>This page is scaffolded and routed — its tools land in {milestone}.</p>
    </div>
  );
}
