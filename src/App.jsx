// Shell only: data load + header + tab routing. Components live in
// src/components/; never add one here.
import { useEffect, useRef, useState } from 'react';
import { S, savedTheme, applyTheme } from './lib/theme.js';
import { ago } from './lib/format.js';
import SportSwitcher from './components/SportSwitcher.jsx';
import Board from './components/Board.jsx';
import Games from './components/Games.jsx';
import Plays from './components/Plays.jsx';
import Results from './components/Results.jsx';
import Methodology from './components/Methodology.jsx';
import { Empty } from './components/ui.jsx';
import { LabStatus, ModelRefresh } from './components/LabStatus.jsx';
import { useLab } from './lib/labStatus.js';

const TABS = [['board', 'Props'], ['plays', 'Plays'], ['games', 'Games'], ['results', 'Results'], ['model', 'Model']];
const TAB_KEY = 'nba-lab-tab';
const REFRESH_MS = 10 * 60 * 1000;

export default function App() {
  const [slate, setSlate] = useState(null);
  const [err, setErr] = useState(null);
  const [results, setResults] = useState(null);
  const [theme, setTheme] = useState(savedTheme());
  const [tab, setTab] = useState(() => { try { return localStorage.getItem(TAB_KEY) || 'board'; } catch { return 'board'; } });
  const [loadedAt, setLoadedAt] = useState(null);

  const lastSlate = useRef(0);
  const slateRef = useRef(null); slateRef.current = slate;
  // /data/* is rewritten to the Vercel Blob store (vercel.json); in dev, vite serves scripts/out.
  // `no-cache` revalidates against the blob's ETag, so an unchanged slate is a 304.
  const loadSlate = () => fetch('/data/slate/latest.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`slate HTTP ${r.status}`))))
    .then((s) => { lastSlate.current = Date.now(); setLoadedAt(new Date()); setErr(null); setSlate((old) => (old?.builtAt === s.builtAt ? old : s)); })
    .catch((e) => setErr((old) => (slateRef.current ? old : String(e.message || e)))); // a failed refresh keeps the last good slate
  const load = () => {
    loadSlate();
    fetch('/api/results').then((r) => r.json()).then(setResults).catch((e) => setResults({ error: String(e.message || e) }));
  };
  useEffect(load, []);
  // Injury updates land in the slate (6:47 PM ET, and every board run): re-read it
  // every 10 minutes while the tab is visible and on return to it, as the NHL lab does.
  useEffect(() => {
    const stale = () => document.visibilityState === 'visible' && Date.now() - lastSlate.current > REFRESH_MS - 5000;
    const tick = setInterval(() => { if (stale()) loadSlate(); }, REFRESH_MS);
    const onVis = () => { if (stale()) loadSlate(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(tick); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  // The header's height as --hdr-h, where the board's pinned table head docks (ui.jsx StickyTable).
  const hdr = useRef(null);
  useEffect(() => {
    const set = () => document.documentElement.style.setProperty('--hdr-h', `${hdr.current.getBoundingClientRect().height}px`);
    set(); const ro = new ResizeObserver(set); ro.observe(hdr.current);
    return () => ro.disconnect();
  }, []);
  const pick = (t) => { setTab(t); try { localStorage.setItem(TAB_KEY, t); } catch { /* private window */ } };
  const flip = () => { const t = theme === 'light' ? 'dark' : 'light'; applyTheme(t); setTheme(t); };
  // Credits, last / next odds pull and model run, and Model Refresh (which
  // replaced the plain Reload: it buys odds and re-runs the board behind a
  // password, then reloads when the run lands). components/LabStatus.jsx.
  const lab = useLab('NBA', load);

  return (
    <div style={S.wrap}>
      <div style={S.grid} /><div style={S.glow} />
      <div style={S.content}>
        <header ref={hdr} style={S.header}>
          <div style={S.hRow} className="hdr-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <SportSwitcher />
              <div>
                <div style={S.title} className="hdr-title">NBA Research Dashboard <span style={S.badge('live')}>2026-27</span></div>
                <div style={S.subtitle} className="hdr-sub">
                  {slate ? `${slate.date} · ${slate.games.length} games · model ${slate.modelVersion} · built ${ago(slate.builtAt)}` : 'loading…'}
                </div>
              </div>
            </div>
            <LabStatus lab={lab} dataAt={loadedAt} onReload={load} className="hdr-status hdr-status-inline" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button style={S.btnGhost} onClick={flip} title="Theme">{theme === 'light' ? '☾' : '☀'}</button>
              <ModelRefresh lab={lab} />
            </div>
          </div>
          <div style={S.hRow}>
            <LabStatus lab={lab} dataAt={loadedAt} onReload={load} className="hdr-status hdr-status-row" />
          </div>
        </header>
        <main style={S.main}>
          <nav style={S.tabNav}>{TABS.map(([k, l]) => <button key={k} style={S.tabBtn(tab === k)} onClick={() => pick(k)}>{l}</button>)}</nav>
          {tab === 'results' ? <Results results={results} />
            : tab === 'model' ? <Methodology slate={slate} />
            : err ? <Empty>Could not load today's slate ({err}). The pipeline publishes it at 10:07 AM and 5:37 PM ET.</Empty>
            : !slate ? <Empty>Loading the slate…</Empty>
            : tab === 'games' ? <Games slate={slate} />
            : tab === 'plays' ? <Plays slate={slate} results={results} />
            : <Board slate={slate} onPlays={() => pick('plays')} />}
        </main>
      </div>
    </div>
  );
}
