import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getProject, getProof, getProofsForProject, projects, proofs } from './data';
import { resolveRoute, formatCommitment } from './logic';
import { Arrow, DetailGrid, Eyebrow, Footer, Logo, PageIntro, ProofCard, ProofStrip, RecordCard, StatusPill, Timeline, TopNav, TrustNote } from './components';
import './styles.css';

const HERO_IMAGE = '/manus-storage/async-images/kQEQBNjABLygDaIQotLlsk/image-1.webp';

function usePageTitle(title) {
  useEffect(() => { document.title = title ? `${title} — Sicher` : 'Sicher — Proof, not promises.'; }, [title]);
}

function Shell({ current, children }) {
  return <><TopNav current={current} />{children}<Footer /></>;
}

function Home() {
  usePageTitle('Proof, not promises.');
  const breach = getProof('demo-breach');
  const running = getProof('demo-running');
  const [activeIndex, setActiveIndex] = useState(2);
  const momentCopy = [
    ['The promise', 'A project says what it will keep visible.'],
    ['Still proving', 'The record keeps checking, even when everything looks fine.'],
    ['The breach', '15,000 is below the 80,000 threshold. The commitment breaks.'],
    ['After', 'The funds come back. The broken moment does not disappear.']
  ];
  return <Shell current="home">
    <main>
      <section className="hero">
        <div className="hero-image-wrap"><img src={HERO_IMAGE} alt="Sunlight refracting through layered architectural glass" /><div className="hero-image-wash" /></div>
        <div className="hero-grid-line hero-grid-line-one" /><div className="hero-grid-line hero-grid-line-two" />
        <div className="hero-copy">
          <Eyebrow>Public proof for measurable commitments</Eyebrow>
          <h1>Proof,<br /><em>not promises.</em></h1>
          <p className="hero-lede">Projects say what they’ll do.<br />Sicher shows whether they did it.</p>
          <div className="hero-actions"><a href="/explore" className="button button-primary">Explore proofs <Arrow /></a><a href="/start" className="button button-ghost">Start a proof <Arrow /></a></div>
        </div>
        <div className="hero-note">01 <span>What was hidden<br />becomes visible.</span></div>
        <ProofCard proof={running} featured />
        <div className="hero-caption"><span>Fig. 01</span><span>Light, time, evidence.</span></div>
      </section>

      <section className="statement-section container">
        <div className="statement-rule" />
        <div className="statement-grid"><Eyebrow>Why Sicher</Eyebrow><h2>Anyone can make a promise.<br /><em>The interesting part is what happens next.</em></h2></div>
        <p className="statement-aside">A commitment is only meaningful when the whole period is visible. Sicher keeps the beginning, the middle, and the end in the same record.</p>
      </section>

      <section className="sequence-section container">
        <div className="section-heading"><div><Eyebrow>One proof, in full</Eyebrow><h2>Before → during → after</h2></div><p>Returning to the starting point does not erase the moment the condition was broken.</p></div>
        <div className="sequence-stage">
          <div className="sequence-side"><span>Threshold</span><strong>80,000</strong><small>must stay above</small></div>
          <div className="sequence-visual"><ProofStrip proof={breach} interactive activeIndex={activeIndex} onSelect={setActiveIndex} /><div className="sequence-detail"><div><Eyebrow>{momentCopy[activeIndex][0]}</Eyebrow><p>{momentCopy[activeIndex][1]}</p></div><span className="sequence-counter">0{activeIndex + 1} / 04</span></div></div>
          <div className="sequence-result"><StatusPill status="not-proven" label="Not proven" /><h3>{activeIndex === 2 ? 'The record remembers.' : 'A clean ending is not the whole story.'}</h3><p>{activeIndex === 2 ? breach.breachCopy : 'Sicher checks the entire promised period, not only the last visible number.'}</p><a href="/proof/demo-breach" className="text-link">See what happened <Arrow small /></a></div>
        </div>
      </section>

      <section className="home-records container">
        <div className="section-heading"><div><Eyebrow>Public record</Eyebrow><h2>Proofs worth looking at.</h2></div><a href="/explore" className="text-link">Explore all proofs <Arrow small /></a></div>
        <div className="record-preview-grid">{proofs.map((proof) => <ProofCard key={proof.id} proof={proof} />)}</div>
      </section>

      <section className="closing-callout"><div className="container closing-inner"><Eyebrow>Make the promise visible</Eyebrow><h2>Say exactly what you’ll do.<br /><em>Let time answer the rest.</em></h2><a href="/start" className="button button-light">Start a proof <Arrow /></a></div></section>
    </main>
  </Shell>;
}

function Explore() {
  usePageTitle('Explore proofs');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => proofs.filter((proof) => {
    const project = getProject(proof.projectId);
    const matchesFilter = filter === 'all' || proof.status === filter;
    const haystack = `${project.name} ${proof.commitment} ${proof.statusLabel}`.toLowerCase();
    return matchesFilter && haystack.includes(query.toLowerCase());
  }), [filter, query]);
  return <Shell current="explore"><main className="container explore-page">
    <PageIntro eyebrow="A curated public record" title={<>Explore<br /><em>proofs.</em></>} body="Every record answers the same simple questions: who promised what, for how long, and what happened next."><TrustNote /></PageIntro>
    <div className="explore-controls"><label className="search-field"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a project or proof" aria-label="Find a project or proof" /></label><div className="filter-row" aria-label="Filter proofs">{[['all', 'All'], ['running', 'Running'], ['proven', 'Proven'], ['not-proven', 'Not proven']].map(([value, label]) => <button type="button" className={filter === value ? 'filter active' : 'filter'} key={value} onClick={() => setFilter(value)}>{label}</button>)}</div></div>
    <div className="explore-list"><div className="list-heading"><Eyebrow>{filtered.length} demo records</Eyebrow><span>Newest first</span></div>{filtered.map((proof) => <RecordCard key={proof.id} proof={proof} project={getProject(proof.projectId)} />)}{filtered.length === 0 && <div className="empty-state"><h3>No matching proof yet.</h3><p>Try another project name or choose All.</p></div>}</div>
  </main></Shell>;
}

function ProjectPage({ id }) {
  const project = getProject(id);
  const projectProofs = getProofsForProject(project.id);
  usePageTitle(project.name);
  return <Shell><main className="container project-page">
    <div className="project-hero"><a href="/explore" className="back-link">← Explore proofs</a><div className="project-identity"><div className="large-initials">{project.initials}</div><div><Eyebrow>{project.location}</Eyebrow><h1>{project.name}</h1><p>{project.description}</p></div></div><div className="project-caption">A project profile is a living record.<br />Failed commitments stay visible.</div></div>
    <section className="project-section"><div className="section-heading"><div><Eyebrow>Active commitments</Eyebrow><h2>What is being proved now.</h2></div><span className="section-number">01</span></div>{projectProofs.filter((proof) => proof.status === 'running').map((proof) => <ProofCard key={proof.id} proof={proof} featured />)}{!projectProofs.some((proof) => proof.status === 'running') && <div className="quiet-empty">No active commitments in this demo record.</div>}</section>
    <section className="project-section"><div className="section-heading"><div><Eyebrow>Complete proof history</Eyebrow><h2>What happened before.</h2></div><span className="section-number">02</span></div><div className="history-list">{projectProofs.map((proof) => <RecordCard key={proof.id} proof={proof} project={project} />)}</div></section>
  </main></Shell>;
}

function StartProof() {
  usePageTitle('Start a proof');
  const steps = ['What will you prove?', 'Where?', 'Set the limit', 'How long?', 'Review your exact words', 'Start'];
  const [step, setStep] = useState(1);
  const [amount, setAmount] = useState('80,000');
  const [template, setTemplate] = useState('minimum');
  const [duration, setDuration] = useState('7 days');
  const [started, setStarted] = useState(false);
  const templateDetails = template === 'minimum'
    ? { name: 'Keep at least this amount here', description: 'The clearest place to begin.', fieldLabel: 'Must stay above' }
    : { name: 'Limit how much can leave', description: 'Set a clear ceiling for the period.', fieldLabel: 'Maximum allowed to leave' };
  const commitment = template === 'minimum' ? `Keep at least ${amount} here for ${duration}.` : `Limit how much can leave to ${amount} over ${duration}.`;
  const canAdvance = step < 6;
  return <Shell><main className="container start-page">
    <div className="start-layout"><aside className="start-rail"><a href="/" className="back-link">← Home</a><Eyebrow>Start a proof</Eyebrow><div className="step-list">{steps.map((label, index) => <button type="button" key={label} className={`${step === index + 1 ? 'active' : ''} ${step > index + 1 ? 'done' : ''}`} onClick={() => index + 1 <= step && setStep(index + 1)}><span>0{index + 1}</span>{label}</button>)}</div><p className="rail-note">A proof is specific by design. Once it starts, the exact condition cannot quietly change.</p></aside>
      <section className="start-content"><div className="start-kicker"><span>Step 0{step}</span><span>Demo flow · no live action</span></div>{started ? <div className="started-state"><span className="success-seal">✓</span><Eyebrow>Demo proof prepared</Eyebrow><h1>Your words are now<br /><em>ready to be witnessed.</em></h1><p>This is a design preview. No live proof has been started. When connected, this exact condition will become the public record.</p><a href="/explore" className="button button-primary">Explore proofs <Arrow /></a></div> : <>
        {step === 1 && <Step title="What will you prove?"><h1>Make the condition<br /><em>plain enough to repeat.</em></h1><p className="step-copy">Choose one of two demo templates. The exact words will stay visible through the whole record.</p><div className="choice-stack"><button type="button" className={template === 'minimum' ? 'choice selected' : 'choice'} onClick={() => setTemplate('minimum')}><span>01</span><b>Keep at least this amount here</b><small>The clearest place to begin.</small></button><button type="button" className={template === 'limit' ? 'choice selected' : 'choice'} onClick={() => setTemplate('limit')}><span>02</span><b>Limit how much can leave</b><small>Set a clear ceiling for the period.</small></button></div></Step>}
        {step === 2 && <Step title="Where?"><h1>Name the place<br /><em>the promise lives.</em></h1><p className="step-copy">This fictional demo location is the public place people will use to check the condition.</p><label className="large-field"><span>Place</span><input defaultValue="Northline Commons" /></label><p className="field-hint">Demo location · fictional record</p></Step>}
        {step === 3 && <Step title="Set the limit"><h1>What is the<br /><em>line to protect?</em></h1><p className="step-copy">Set the number the proof will be measured against for the whole period.</p><label className="large-field"><span>{templateDetails.fieldLabel}</span><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="numeric" /></label></Step>}
        {step === 4 && <Step title="How long?"><h1>Give the promise<br /><em>enough time.</em></h1><p className="step-copy">Choose a period that makes the commitment meaningful.</p><div className="duration-options">{['24 hours', '7 days', '30 days'].map((value) => <button type="button" className={duration === value ? 'duration selected' : 'duration'} key={value} onClick={() => setDuration(value)}>{value}<span>{value === '7 days' ? 'A clear first window' : 'Available in the live flow'}</span></button>)}</div></Step>}
        {step === 5 && <Step title="Review your exact words"><div className="review-card"><Eyebrow>{templateDetails.name}</Eyebrow><h1>“{commitment}”</h1><div className="review-rule" /><p>Once started, this condition cannot quietly change.</p><span className="review-demo"><i />Demo flow · no live action</span></div></Step>}
        {step === 6 && <Step title="Start"><div className="review-card review-card-final"><Eyebrow>Ready when you are</Eyebrow><h1>Make the commitment<br /><em>visible.</em></h1><p>Your proof will be created exactly as written above. In this preview, the next step is intentionally paused before any live action.</p><button type="button" className="button button-primary" onClick={() => setStarted(true)}>Start this proof <Arrow /></button></div></Step>}
        <div className="step-actions">{step > 1 && <button type="button" className="button button-ghost" onClick={() => setStep(step - 1)}>Back</button>}{canAdvance && <button type="button" className="button button-primary" onClick={() => setStep(step + 1)}>{step === 5 ? 'Review start' : 'Continue'} <Arrow /></button>}</div>
      </>}</section>
    </div>
  </main></Shell>;
}

function Step({ title, children }) { return <div className="step-view"><Eyebrow>{title}</Eyebrow>{children}</div>; }

function ProofPage({ id }) {
  const proof = getProof(id);
  usePageTitle(proof.statusLabel);
  if (proof.status === 'not-proven') return <BrokenProof proof={proof} />;
  if (proof.status === 'proven') return <ProvenProof proof={proof} />;
  return <RunningProof proof={proof} />;
}

function ProofHeader({ proof, children }) {
  return <Shell><main className={`proof-detail proof-detail-${proof.status}`}><div className="container"><a href="/explore" className="back-link">← All proofs</a><div className="proof-detail-top"><div><Eyebrow>{proof.label} · {getProject(proof.projectId).name}</Eyebrow><h1>{proof.status === 'running' ? <>Proof<br /><em>running.</em></> : proof.status === 'proven' ? <>Quietly<br /><em>proven.</em></> : <>Not<br /><em>proven.</em></>}</h1></div><StatusPill status={proof.status} label={proof.statusLabel} /></div>{children}</div></main></Shell>;
}

function RunningProof({ proof }) {
  return <ProofHeader proof={proof}><p className="proof-commitment">“{formatCommitment(proof)}”</p><DetailGrid proof={proof} /><div className="proof-focus running-focus"><div className="focus-label"><Eyebrow>Current position</Eyebrow><span>Day 3 of 7</span></div><div className="big-current">{proof.currentValue}</div><p>Still above the commitment line.</p><Timeline proof={proof} activeIndex={1} /></div><div className="proof-bottom-actions"><a className="button button-primary" href={`/proof/${proof.id}/receipt`}>See proof <Arrow /></a><span>Started by {proof.startedBy}</span></div></ProofHeader>;
}

function ProvenProof({ proof }) {
  return <ProofHeader proof={proof}><p className="proof-commitment">“{proof.commitment.replace('Keep', 'Kept').replace(' for', ' for the entire') }”</p><DetailGrid proof={proof} /><div className="proof-focus proven-focus"><div className="proven-symbol">✓</div><Eyebrow>Every check held</Eyebrow><h2>The condition stayed true<br /><em>for the entire {proof.duration}.</em></h2><Timeline proof={proof} activeIndex={1} /></div><div className="proof-bottom-actions"><a className="button button-primary" href={`/proof/${proof.id}/receipt`}>See how this was proven <Arrow /></a><span>Evidence available · {proof.ends}</span></div></ProofHeader>;
}

function BrokenProof({ proof }) {
  const [activeIndex, setActiveIndex] = useState(2);
  return <ProofHeader proof={proof}><p className="proof-commitment">“{proof.commitment}”</p><div className="breach-hero"><div className="breach-copy"><Eyebrow>The commitment was broken</Eyebrow><h2>The funds came back,<br /><em>but the commitment had already been broken.</em></h2><p>{proof.breachCopy}</p><div className="breach-brand-line">The record remembers.</div></div><div className="breach-stamp">NOT<br />PROVEN</div></div><div className="breach-sequence"><div className="breach-sequence-heading"><Eyebrow>Before → during → after</Eyebrow><span>7 day proof window</span></div><ProofStrip proof={proof} interactive activeIndex={activeIndex} onSelect={setActiveIndex} /><div className="breach-moment"><div><Eyebrow>The moment it broke</Eyebrow><strong>{activeIndex === 2 ? proof.breachValue : proof.sequence[activeIndex]}</strong><span>{activeIndex === 2 ? proof.breachDay : activeIndex === 3 ? 'After the breach' : 'Before the breach'}</span></div><p>{activeIndex === 2 ? `This number was below the ${proof.threshold} condition. The later recovery cannot rewrite it.` : 'Sicher keeps the full sequence visible so the context stays intact.'}</p></div></div><div className="proof-bottom-actions"><a className="button button-dark" href={`/proof/${proof.id}/receipt`}>See what happened <Arrow /></a><span>Started by {proof.startedBy}</span></div></ProofHeader>;
}

function Receipt({ id }) {
  const proof = getProof(id);
  const project = getProject(proof.projectId);
  const [technical, setTechnical] = useState(false);
  usePageTitle('Receipt');
  return <Shell><main className="container receipt-page"><a href={`/proof/${proof.id}`} className="back-link">← Back to proof</a><div className="receipt-heading"><div><Eyebrow>Proof receipt · {proof.label}</Eyebrow><h1>A record you can<br /><em>read in plain English.</em></h1></div><StatusPill status={proof.status} label={proof.statusLabel} /></div><section className="receipt-paper"><div className="receipt-project"><span className="project-initials">{project.initials}</span><span><b>{project.name}</b><small>Started by {proof.startedBy}</small></span></div><div className="receipt-section"><Eyebrow>What was promised</Eyebrow><h2>{proof.commitment}</h2></div><div className="receipt-section"><Eyebrow>What happened</Eyebrow><p>{proof.status === 'not-proven' ? proof.breachCopy : proof.status === 'proven' ? `The amount stayed above ${proof.threshold} for all ${proof.duration}.` : `The proof is still running. The current amount is ${proof.currentValue}.`}</p>{proof.status === 'not-proven' && <ProofStrip proof={proof} />}</div><div className="receipt-meta"><div><Eyebrow>{proof.status === 'not-proven' ? 'When it broke' : 'Period'}</Eyebrow><strong>{proof.status === 'not-proven' ? `${proof.breachDay} · ${proof.breachValue}` : proof.duration}</strong></div><div><Eyebrow>When it began</Eyebrow><strong>{proof.started}</strong></div><div><Eyebrow>When it ended</Eyebrow><strong>{proof.status === 'running' ? 'Still proving' : proof.ends}</strong></div></div><div className="receipt-section receipt-starter"><Eyebrow>Who started the proof</Eyebrow><p>{proof.startedBy}</p></div></section><section className="technical-section"><button type="button" className="technical-toggle" onClick={() => setTechnical(!technical)}><span>See technical evidence</span><span>{technical ? '−' : '+'}</span></button>{technical && <div className="technical-reveal"><Eyebrow>For people who want the deeper record</Eyebrow><div className="technical-grid"><div><span>Evidence reference</span><b>demo://sicher/{proof.id}</b></div><div><span>Check cadence</span><b>Continuous during window</b></div><div><span>Record state</span><b>Immutable after start</b></div><div><span>Source</span><b>Demo environment</b></div></div></div>}</section></main></Shell>;
}

function About() {
  usePageTitle('How Sicher works');
  const steps = [
    ['01', 'A project says what it will do.', 'The condition is written in exact, human words before the outcome is known.'],
    ['02', 'Sicher keeps checking.', 'The whole promised window stays in view. A temporary drop is not hidden by a later recovery.'],
    ['03', 'The record tells the truth.', 'At the end, anyone can see whether the exact commitment held — or the moment it broke.']
  ];
  return <Shell current="about"><main className="about-page"><section className="about-hero container"><Eyebrow>How Sicher works</Eyebrow><h1>Make the invisible<br /><em>easy to see.</em></h1><p>Trust is not a feeling we add after the fact. It is a record of what was promised, checked across time, and left intact.</p></section><section className="about-steps container">{steps.map(([number, title, body]) => <article className="about-step" key={number}><span>{number}</span><h2>{title}</h2><p>{body}</p></article>)}</section><section className="about-split"><div className="about-split-image"><img src={HERO_IMAGE} alt="Reflected sunlight through transparent materials" /></div><div className="about-split-copy"><Eyebrow>The important part</Eyebrow><h2>What happened in the middle<br /><em>stays part of the story.</em></h2><p>If a promise says “keep at least 80,000 here for 7 days,” then 15,000 on day 3 matters — even if the number returns to 100,000 on day 4.</p><a href="/proof/demo-breach" className="text-link">See the broken proof <Arrow small /></a></div></section><section className="about-end container"><Eyebrow>Built for clarity</Eyebrow><h2>Technical detail is available<br /><em>when you want it.</em></h2><p>Sicher starts with plain English. The deeper evidence is there for people who need to inspect it, not as a barrier to understanding the promise.</p><a href="/explore" className="button button-primary">Explore proofs <Arrow /></a></section></main></Shell>;
}

function NotFound() { return <Shell><main className="container not-found"><Eyebrow>Nothing here yet</Eyebrow><h1>That page has<br /><em>not been recorded.</em></h1><a href="/" className="button button-primary">Back home <Arrow /></a></main></Shell>; }

function App() {
  const [route, setRoute] = useState(() => resolveRoute(window.location.pathname));
  useEffect(() => { const onPop = () => setRoute(resolveRoute(window.location.pathname)); window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop); }, []);
  useEffect(() => { const handleClick = (event) => { const link = event.target.closest('a'); if (!link || link.target === '_blank' || link.origin !== window.location.origin) return; const href = link.getAttribute('href'); if (!href || href.startsWith('#')) return; event.preventDefault(); window.history.pushState({}, '', href); setRoute(resolveRoute(href)); window.scrollTo({ top: 0, behavior: 'smooth' }); }; document.addEventListener('click', handleClick); return () => document.removeEventListener('click', handleClick); }, []);
  if (route.name === 'home') return <Home />;
  if (route.name === 'explore') return <Explore />;
  if (route.name === 'project') return <ProjectPage id={route.id} />;
  if (route.name === 'start') return <StartProof />;
  if (route.name === 'proof') return <ProofPage id={route.id} />;
  if (route.name === 'receipt') return <Receipt id={route.id} />;
  if (route.name === 'about') return <About />;
  return <NotFound />;
}

createRoot(document.getElementById('root')).render(<App />);
