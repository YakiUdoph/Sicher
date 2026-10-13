import React, { useState } from 'react';
import { formatCommitment, statusPath, statusTone } from './logic';

export function Logo({ compact = false }) {
  return (
    <a href="/" className={`brand ${compact ? 'brand-compact' : ''}`} aria-label="Sicher home">
      <span className="brand-mark"><span /></span>
      <span className="brand-name">Sicher</span>
    </a>
  );
}

export function Arrow({ small = false }) {
  return <span className={`arrow ${small ? 'arrow-small' : ''}`} aria-hidden="true">↗</span>;
}

export function TopNav({ current = '' }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const links = [
    ['Explore', '/explore', 'explore'],
    ['How it works', '/about', 'about']
  ];
  return (
    <header className={`top-nav ${menuOpen ? 'menu-is-open' : ''}`}>
      <Logo />
      <nav className="nav-links" aria-label="Primary navigation">
        {links.map(([label, href, key]) => <a key={key} className={current === key ? 'active' : ''} href={href}>{label}</a>)}
      </nav>
      <div className="nav-actions">
        <a className="nav-about" href="/about">About</a>
        <a className="text-link" href="/start">Start a proof <Arrow small /></a>
        <button className="connect-button" type="button" onClick={() => window.alert('Demo only — no connection is made.')}>Connect</button>
      </div>
      <button className="menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="mobile-menu" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? 'Close' : 'Menu'}<span aria-hidden="true">{menuOpen ? '−' : '+'}</span></button>
      <div id="mobile-menu" className={`mobile-menu ${menuOpen ? 'is-open' : ''}`} aria-hidden={!menuOpen}>
        {links.map(([label, href, key]) => <a key={key} className={current === key ? 'active' : ''} href={href} onClick={() => setMenuOpen(false)}>{label}<Arrow small /></a>)}
        <a href="/start" onClick={() => setMenuOpen(false)}>Start a proof <Arrow small /></a>
        <button type="button" onClick={() => { setMenuOpen(false); window.alert('Demo only — no connection is made.'); }}>Connect</button>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <Logo compact />
        <p>Proof, not promises.</p>
        <a href="/start" className="button button-dark">Start a proof <Arrow /></a>
      </div>
      <div className="footer-bottom">
        <span>Demo environment · fictional records</span>
        <span>Built for visibility, not noise.</span>
        <span>© 2026 Sicher</span>
      </div>
    </footer>
  );
}

export function Eyebrow({ children, tone = '' }) {
  return <span className={`eyebrow ${tone ? `eyebrow-${tone}` : ''}`}>{children}</span>;
}

export function StatusPill({ status, label, compact = false }) {
  const tone = statusTone(status);
  return <span className={`status-pill status-${tone} ${compact ? 'status-compact' : ''}`}><i />{label || status.replace('-', ' ')}</span>;
}

export function ProofStrip({ proof, interactive = false, activeIndex, onSelect }) {
  return (
    <div className={`proof-strip ${interactive ? 'proof-strip-interactive' : ''}`}>
      {proof.sequence.map((value, index) => (
        <React.Fragment key={`${value}-${index}`}>
          <button
            type="button"
            className={`proof-point ${index === 2 && proof.status === 'not-proven' ? 'point-breach' : ''} ${activeIndex === index ? 'point-active' : ''}`}
            onClick={() => onSelect?.(index)}
            aria-label={`View moment ${index + 1}: ${value}`}
          >
            <span className="proof-number">{value}</span>
            {index === 2 && proof.status === 'not-proven' && <span className="proof-point-note">broken</span>}
            {activeIndex === index && interactive && <span className="proof-point-line" />}
          </button>
          {index < proof.sequence.length - 1 && <span className="proof-connector">→</span>}
        </React.Fragment>
      ))}
    </div>
  );
}

export function Timeline({ proof, activeIndex = -1 }) {
  return (
    <div className="timeline" aria-label="Proof period timeline">
      <div className="timeline-line"><span style={{ width: proof.status === 'running' ? '57%' : '100%' }} /></div>
      <div className="timeline-points">
        <div><b>Started</b><span>{proof.started}</span></div>
        {proof.status === 'not-proven' ? <div className="timeline-breach"><b>{proof.breachDay}</b><span>Commitment broke</span></div> : <div><b>{proof.status === 'running' ? proof.remaining : 'Held'}</b><span>{proof.status === 'running' ? 'Still proving' : 'Entire period'}</span></div>}
        <div><b>{proof.status === 'running' ? 'Now' : 'Ended'}</b><span>{proof.status === 'running' ? proof.currentValue : proof.ends}</span></div>
      </div>
      {activeIndex >= 0 && <div className="timeline-caption">The record is checked across the whole line, not just the last moment.</div>}
    </div>
  );
}

export function ProofCard({ proof, featured = false }) {
  return (
    <a href={`/proof/${proof.id}`} className={`proof-card ${featured ? 'proof-card-featured' : ''} card-lift`}>
      <div className="proof-card-top"><Eyebrow>{proof.label}</Eyebrow><StatusPill status={proof.status} label={proof.statusLabel} compact /></div>
      <p className="proof-card-title">{proof.shortCommitment}<br /><span>for {proof.duration.replace(' ', ' ')}</span></p>
      <div className="proof-card-meta">
        <span>{proof.status === 'running' ? proof.remaining : proof.status === 'proven' ? 'Held for the full period' : `Broke on ${proof.breachDay}`}</span>
        <Arrow />
      </div>
      {featured && <div className="proof-card-rule" />}
      {featured && <div className="proof-card-values"><span>{proof.currentValue}</span><small>Current</small></div>}
    </a>
  );
}

export function RecordCard({ proof, project }) {
  return (
    <a href={`/proof/${proof.id}`} className={`record-card record-${statusTone(proof.status)}`}>
      <div className="record-main">
        <div className="record-id"><span className="project-initials">{project.initials}</span><span><b>{project.name}</b><small>{proof.label}</small></span></div>
        <StatusPill status={proof.status} label={proof.statusLabel} />
      </div>
      <div className="record-grid">
        <div><Eyebrow>What was promised</Eyebrow><p>{formatCommitment(proof)}</p></div>
        <div><Eyebrow>How long</Eyebrow><p>{proof.duration}</p></div>
        <div><Eyebrow>What happened</Eyebrow><p>{proof.status === 'running' ? `${proof.currentValue} now · ${proof.remaining}` : proof.status === 'proven' ? 'Held for the entire period.' : `Dropped to ${proof.breachValue} on ${proof.breachDay}.`}</p></div>
      </div>
      <div className="record-arrow"><Arrow /></div>
    </a>
  );
}

export function PageIntro({ eyebrow, title, body, children, dark = false }) {
  return (
    <section className={`page-intro ${dark ? 'page-intro-dark' : ''}`}>
      <div><Eyebrow>{eyebrow}</Eyebrow><h1>{title}</h1></div>
      <div className="page-intro-right"><p>{body}</p>{children}</div>
    </section>
  );
}

export function TrustNote() {
  return <div className="trust-note"><span className="note-mark">i</span><span>Demo records only. These fictional examples are not connected to live data.</span></div>;
}

export function DetailGrid({ proof }) {
  return (
    <div className="detail-grid">
      <div><Eyebrow>What was promised</Eyebrow><strong>{formatCommitment(proof)}</strong></div>
      <div><Eyebrow>Started with</Eyebrow><strong>{proof.startValue}</strong></div>
      <div><Eyebrow>Must stay above</Eyebrow><strong>{proof.threshold}</strong></div>
      <div><Eyebrow>{proof.status === 'running' ? 'Time remaining' : 'Proof period'}</Eyebrow><strong>{proof.status === 'running' ? proof.remaining : proof.duration}</strong></div>
    </div>
  );
}
