// ── A clickable price ────────────────────────────────────────────────────────
// One book's price on the pick. Tapping it hands over that book's bet slip with
// the outcome already on it — the native share sheet on a phone (AirDrop,
// Messages, Copy), a Copy link | Open popover everywhere else. Ported from the
// NFL lab's OddsCell.jsx (itself the MLB lab's OddsLink.jsx), in this board's
// colours: best price accent and bold, the rest muted.
//
// The popover is plain DOM, not React state: the board re-renders on every sort
// and filter, and a popover living in a row's tree vanishes when anything moves.
//
// Only a real bet-slip URL makes a cell clickable (src/lib/betslip.js); a book
// with no link stays plain text rather than dropping you on its homepage.
import { C, alpha } from '../lib/theme.js';
import { BOOK_NAMES } from '../lib/betslip.js';
import { am } from '../lib/format.js';

const POPUP_ID = 'odds-popup';
let teardown = null;

function dismiss() {
  document.getElementById(POPUP_ID)?.remove();
  teardown?.();
  teardown = null;
}

function toast(text) {
  document.getElementById('betslip-toast')?.remove();
  const el = document.createElement('div');
  el.id = 'betslip-toast';
  el.textContent = text;
  Object.assign(el.style, {
    position: 'fixed', bottom: '28px', left: '50%', transform: 'translateX(-50%)',
    background: C.panelSolid, color: C.txt, border: `1px solid ${C.line}`,
    padding: '9px 18px', borderRadius: '8px', fontSize: '12px', fontWeight: '600',
    zIndex: '99999', pointerEvents: 'none', boxShadow: `0 8px 28px ${alpha(C.shadow, 0.45)}`,
    opacity: '1', transition: 'opacity 0.4s ease',
  });
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; }, 1700);
  setTimeout(() => el.remove(), 2200);
}

function popover(url, bookName, anchor) {
  dismiss();
  const pop = document.createElement('div');
  pop.id = POPUP_ID;
  Object.assign(pop.style, {
    position: 'fixed', width: '162px', zIndex: '99999',
    background: C.panelSolid, border: `1px solid ${C.line}`, borderRadius: '10px',
    padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '6px',
    boxShadow: `0 12px 36px ${alpha(C.shadow, 0.5)}`,
  });
  const label = document.createElement('div');
  label.textContent = `${bookName} bet slip`;
  Object.assign(label.style, { fontSize: '9px', fontWeight: '700', letterSpacing: '0.06em', color: C.faint, textTransform: 'uppercase' });

  const button = (text, color, onClick) => {
    const b = document.createElement('button');
    b.textContent = text;
    Object.assign(b.style, {
      padding: '6px 0', fontSize: '12px', fontWeight: '600', borderRadius: '6px', cursor: 'pointer',
      border: `1px solid ${alpha(color, 0.4)}`, background: alpha(color, 0.12), color, fontFamily: 'inherit',
    });
    b.onclick = (e) => { e.stopPropagation(); onClick(); dismiss(); };
    return b;
  };
  pop.append(
    label,
    button('Copy link', C.accent, () => {
      navigator.clipboard?.writeText(url).then(() => toast(`${bookName} bet slip copied`), () => toast('Copy blocked — use Open'));
    }),
    button('Open', C.good, () => window.open(url, '_blank', 'noopener,noreferrer')),
  );
  document.body.appendChild(pop);

  const r = anchor?.getBoundingClientRect();
  if (r) {
    const left = Math.max(8, Math.min(r.left + r.width / 2 - pop.offsetWidth / 2, window.innerWidth - pop.offsetWidth - 8));
    const above = r.top - pop.offsetHeight - 8;
    pop.style.left = `${left}px`;
    // the app header and the pinned table head cover the top ~110px; open below there
    pop.style.top = `${above < 120 ? r.bottom + 8 : above}px`;
  }

  // Close on the next click anywhere, Escape, or any scroll (the popover is
  // fixed against a row; `capture` catches the table's own sideways scroll).
  // Deferred a tick so the click that opened it does not close it.
  const close = () => dismiss();
  const onKey = (e) => { if (e.key === 'Escape') dismiss(); };
  teardown = () => {
    document.removeEventListener('click', close);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('scroll', close, true);
  };
  setTimeout(() => {
    document.addEventListener('click', close, { once: true });
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, { once: true, capture: true });
  }, 0);
}

function openSlip(e, url, book) {
  // the row's own click opens the player panel — a price tap must not
  e.preventDefault();
  e.stopPropagation();
  const name = BOOK_NAMES[book] || book;
  // The share sheet where the browser has one, as the other labs do (it must open
  // inside the click gesture; a rejection is the user cancelling, not a failure).
  if (typeof navigator.share === 'function') {
    navigator.share({ title: `${name} bet slip`, url }).catch(() => {});
  } else {
    popover(url, name, e.currentTarget);
  }
}

// Each book's price in its brand color (FanDuel blue, DraftKings green, Hard Rock purple).
const BOOK_TEXT = { fanduel: C.bookFd, draftkings: C.bookDk, hardrockbet: C.bookHr };

/** One book's price on the pick; `best` marks the best price across every book. */
export function OddsCell({ price, url, book, best }) {
  if (price == null) return <span style={{ color: C.faintest }}>—</span>;
  const style = { color: BOOK_TEXT[book] || C.txt2, fontWeight: best ? 700 : 400 };
  if (!url) return <span style={style} title={`${BOOK_NAMES[book] || book} posted no bet-slip link`}>{am(price)}</span>;
  return (
    <button type="button" className="odds-link" style={style} onClick={(e) => openSlip(e, url, book)}
      title={`${BOOK_NAMES[book] || book} ${am(price)} — tap to share or open the bet slip`}>
      {am(price)}
    </button>
  );
}
