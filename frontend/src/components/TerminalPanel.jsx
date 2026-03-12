import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, useDragControls } from 'framer-motion';

// ── Config ────────────────────────────────────────────────────
const WS_URL      = '/ws';
const PANEL_W     = 860;
const PANEL_H     = 680;
const TITLE_H     = 36;
const T1_ROWS = 1;   // last N scrollback lines: 14px white + full colour (matches active)
const T2_ROWS = 5;   // next N scrollback lines: 12px grey base + ANSI accents
                     // everything older:         11px flat grey, no accents
const FONT        = '"JetBrains Mono", "Cascadia Code", "Fira Code", Consolas, monospace';

// ── Modes ─────────────────────────────────────────────────────
const MODES = {
  shell: { label: 'Shell', prompt: '>_', color: '#75FBA1' },
  os:    { label: 'OS',    prompt: '⌘_', color: '#80c8ff' },
  ai:    { label: 'AI',    prompt: '?_', color: '#ffd580' },
  spot:  { label: 'Spot',  prompt: '⌕',  color: '#c678dd' },
};
const MODE_ORDER = ['shell', 'os', 'ai', 'spot'];

// ── Palette ───────────────────────────────────────────────────
const C = {
  // Input token colours (mode-agnostic)
  cmd:         '#ffffff',
  flag:        '#80c8ff',
  arg:         '#b8c0cc',
  str:         '#ffd580',
  num:         '#ffd580',
  // History tiers
  t1Base:      '#ffffff',   // tier-1: white  (previous cmd + output)
  t2Base:      '#6b7a8d',   // tier-2: grey base, ANSI accents still show
  t3Base:      '#3a4155',   // tier-3: flat grey, no accents
};

// ANSI SGR code → hex  (covers what the backend emits)
const ANSI = {
  '30': '#1a1a2e', '31': '#ff7b7b', '32': '#00ff88', '33': '#ffd580',
  '34': '#80c8ff', '35': '#c678dd', '36': '#56d4f5', '37': '#f0f2f8',
  '90': '#5a5f78', '91': '#ff9999', '92': '#a6e3a1', '93': '#ffe49d',
  '94': '#a5d6ff', '95': '#d2a8ff', '96': '#89dceb', '97': '#ffffff',
};

// ── ANSI → segment array ──────────────────────────────────────
// Returns [{ text, color: string|null, bold: bool }]
function parseAnsi(raw) {
  const out = [];
  const re  = /\x1b\[([0-9;]*)m/g;
  let last = 0, color = null, bold = false, m;

  while ((m = re.exec(raw)) !== null) {
    if (m.index > last) out.push({ text: raw.slice(last, m.index), color, bold });
    const codes = m[1].split(';').filter(Boolean);
    if (!codes.length || codes[0] === '0') { color = null; bold = false; }
    else for (const c of codes) {
      if (c === '1') bold = true;
      else if (ANSI[c]) color = ANSI[c];
    }
    last = m.index + m[0].length;
  }
  if (last < raw.length) out.push({ text: raw.slice(last), color, bold });
  return out.filter(s => s.text !== '');
}

// ── Syntax-tokenise the live input line ──────────────────────
function tokenise(input) {
  if (!input) return [];
  const parts  = input.match(/(".*?"|'.*?'|\S+|\s+)/g) ?? [];
  let   isFirst = true;
  return parts.map(p => {
    if (!p.trim()) return { text: p, color: C.arg };
    if (isFirst)              { isFirst = false; return { text: p, color: C.cmd  }; }
    if (/^--?/.test(p))      return { text: p, color: C.flag };
    if (/^["']/.test(p))     return { text: p, color: C.str  };
    if (/^\d+(\.\d+)?$/.test(p)) return { text: p, color: C.num  };
    return { text: p, color: C.arg };
  });
}

// ── Line factory ──────────────────────────────────────────────
let _lid = 0;
const mkLine = (segs, meta = {}) => ({ id: _lid++, segments: segs, ...meta });

// ── Component ─────────────────────────────────────────────────
export default function TerminalPanel({ onClose }) {
  const dragControls = useDragControls();
  const containerRef = useRef(null);
  const scrollRef    = useRef(null);
  const wsRef        = useRef(null);
  const reconnRef    = useRef(null);
  const inputRef     = useRef('');      // source-of-truth for input (avoids stale closure)
  const histRef      = useRef([]);      // command history
  const histIdxRef   = useRef(-1);

  const [connected,     setConnected]     = useState(false);
  const [minimized,     setMinimized]     = useState(false);
  const [lines,         setLines]         = useState([]);
  const [input,         setInput]         = useState('');
  const [cursorOn,      setCursorOn]      = useState(true);
  const [mode,          setMode]          = useState('shell');
  const [modeMenuOpen,  setModeMenuOpen]  = useState(false);
  const modeRef = useRef('shell'); // always-current mode for use inside callbacks

  // Cursor blink
  useEffect(() => {
    const t = setInterval(() => setCursorOn(v => !v), 530);
    return () => clearInterval(t);
  }, []);

  // Keep modeRef in sync with mode state
  useEffect(() => { modeRef.current = mode; }, [mode]);

  // Close mode menu on outside click
  useEffect(() => {
    if (!modeMenuOpen) return;
    const close = () => setModeMenuOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [modeMenuOpen]);

  // Auto-scroll to bottom whenever lines or input change
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, input]);

  // Auto-focus on mount & un-minimise
  useEffect(() => { containerRef.current?.focus(); }, []);
  useEffect(() => {
    if (!minimized) setTimeout(() => containerRef.current?.focus(), 50);
  }, [minimized]);

  // ── Ingest raw server text ────────────────────────────────
  // Appends to last line on the first segment, then creates new lines.
  const ingest = useCallback((raw) => {
    const parts = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    setLines(prev => {
      const next = [...prev];
      parts.forEach((part, i) => {
        const segs = parseAnsi(part);
        if (i === 0 && next.length > 0) {
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, segments: [...last.segments, ...segs] };
        } else {
          next.push(mkLine(segs));
        }
      });
      return next;
    });
  }, []);

  // ── WebSocket ─────────────────────────────────────────────
  const connect = useCallback(() => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws    = new WebSocket(`${proto}://${location.host}${WS_URL}`);
    wsRef.current = ws;

    ws.onopen  = () => { clearTimeout(reconnRef.current); setConnected(true); };
    ws.onclose = () => { setConnected(false); reconnRef.current = setTimeout(connect, 3000); };
    ws.onerror = () => setConnected(false);

    ws.onmessage = ({ data }) => {
      let msg; try { msg = JSON.parse(data); } catch { return; }
      if (msg.type === 'output' && msg.data) ingest(msg.data);
      if (msg.type === 'clear')              setLines([]);
      if (msg.type === 'open' && msg.url)    window.open(msg.url, '_blank', 'noopener');
      // 'prompt' is implicit — the input row is always visible
    };
  }, [ingest]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnRef.current);
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
    };
  }, [connect]);

  // ── Keyboard handler ──────────────────────────────────────
  const handleKey = useCallback((e) => {
    const { key, ctrlKey, altKey, metaKey } = e;
    if (altKey || metaKey) return;

    // Ctrl shortcuts
    if (ctrlKey) {
      if (key === 'Tab') {
        e.preventDefault();
        const next = MODE_ORDER[(MODE_ORDER.indexOf(modeRef.current) + 1) % MODE_ORDER.length];
        modeRef.current = next; setMode(next);
      }
      if (key === 'c') {
        e.preventDefault();
        setLines(p => [...p, mkLine([{ text: '^C', color: C.t2Base, bold: false }])]);
        inputRef.current = ''; setInput('');
      }
      if (key === 'l') { e.preventDefault(); setLines([]); }
      return;
    }

    // Enter — send command
    if (key === 'Enter') {
      e.preventDefault();
      const cmd = inputRef.current.trim();
      // Echo to scrollback — tagged isPrompt so getTier can find the boundary
      const m = MODES[modeRef.current];
      setLines(p => [
        ...p,
        mkLine(
          [{ text: `${m.prompt} `, color: m.color, bold: false },
           { text: cmd, color: '#ffffff', bold: false }],
          { isPrompt: true }
        ),
      ]);
      if (cmd) {
        histRef.current.unshift(cmd);
        histIdxRef.current = -1;
        wsRef.current?.readyState === WebSocket.OPEN
          ? wsRef.current.send(JSON.stringify({ type: 'command', input: cmd }))
          : setLines(p => [...p, mkLine([{ text: '  [disconnected — reconnecting…]', color: '#ff7b7b', bold: false }])]);
      }
      inputRef.current = ''; setInput('');
      return;
    }

    // Backspace
    if (key === 'Backspace') {
      e.preventDefault();
      const v = inputRef.current.slice(0, -1);
      inputRef.current = v; setInput(v);
      return;
    }

    // History ↑
    if (key === 'ArrowUp') {
      e.preventDefault();
      const h = histRef.current;
      if (histIdxRef.current < h.length - 1) {
        const v = h[++histIdxRef.current];
        inputRef.current = v; setInput(v);
      }
      return;
    }

    // History ↓
    if (key === 'ArrowDown') {
      e.preventDefault();
      if (histIdxRef.current > 0) {
        const v = histRef.current[--histIdxRef.current];
        inputRef.current = v; setInput(v);
      } else if (histIdxRef.current === 0) {
        histIdxRef.current = -1;
        inputRef.current = ''; setInput('');
      }
      return;
    }

    // Printable characters
    if (key.length === 1) {
      e.preventDefault();
      const v = inputRef.current + key;
      inputRef.current = v; setInput(v);
    }
  }, []);

  // ── Render ────────────────────────────────────────────────
  const panelH = minimized ? TITLE_H : PANEL_H;

  // Index of the last prompt echo — white zone stretches from here to end of scrollback
  const lastCmdIdx = lines.reduce(
    (found, line, i) => line.isPrompt ? i : found,
    -1
  );

  // Tier 1 = white (current cmd + its output), 2 = grey+accent, 3 = flat grey
  function getTier(idx) {
    if (lastCmdIdx >= 0) {
      if (idx >= lastCmdIdx) return 1;
      if ((lastCmdIdx - 1 - idx) < T2_ROWS) return 2;
      return 3;
    }
    const fromEnd = lines.length - 1 - idx;
    if (fromEnd < T1_ROWS) return 1;
    if (fromEnd < T1_ROWS + T2_ROWS) return 2;
    return 3;
  }

  return (
    <motion.div
      drag
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      dragElastic={0}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ type: 'spring', stiffness: 340, damping: 32 }}
      style={{
        position: 'absolute',
        left: `calc(50% - ${PANEL_W / 2}px)`,
        top:  `calc(50% - ${PANEL_H / 2}px - 20px)`,
        width:  PANEL_W,
        height: panelH,
        zIndex: 50,
      }}
    >
      <div className="w-full h-full flex flex-col" style={{ overflow: 'visible' }}>

        {/* ── Title bar / drag handle ───────────────────────── */}
        <div
          onPointerDown={e => dragControls.start(e)}
          className="shrink-0 flex items-center px-3 cursor-grab active:cursor-grabbing"
          style={{ height: TITLE_H, userSelect: 'none' }}
        >
          {/* Traffic lights */}
          <div className="flex items-center gap-[7px]">
            <Dot color="#ff5f57" hoverColor="#ff3b30" label="×" onClick={onClose} />
            <Dot color="#febc2e" hoverColor="#ffb800" label="–" onClick={() => setMinimized(v => !v)} />
            <Dot color="#28c840" hoverColor="#1db836" label="+" onClick={() => {}} />
          </div>

          {/* Filename + active mode */}
          <div className="flex-1 flex justify-center">
            <span className="font-mono text-[11px] tracking-wider">
              <span style={{ color: 'rgba(255,255,255,0.28)' }}>— ambient_os.sh</span>
              <span style={{ color: MODES[mode].color, opacity: 0.75 }}>_{MODES[mode].label}</span>
              <span style={{ color: 'rgba(255,255,255,0.28)' }}> —</span>
            </span>
          </div>

          {/* Mode switcher */}
          <div style={{ position: 'relative' }}>
            <button
              onPointerDown={e => e.stopPropagation()} // don't trigger panel drag
              onClick={() => setModeMenuOpen(v => !v)}
              className="flex items-center gap-1.5"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{
                background: connected ? MODES[mode].color : '#ff5f57',
                boxShadow:  connected ? `0 0 5px ${MODES[mode].color}` : 'none',
                transition: 'all 0.3s',
              }} />
              <span className="font-mono text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                {MODES[mode].label}
              </span>
              <span style={{ color: 'rgba(255,255,255,0.18)', fontSize: 8, lineHeight: 1 }}>▾</span>
            </button>

            {/* Dropdown */}
            {modeMenuOpen && (
              <div
                onPointerDown={e => e.stopPropagation()}
                style={{
                  position:       'absolute',
                  top:            'calc(100% + 8px)',
                  right:          0,
                  background:     'rgba(6, 8, 16, 0.88)',
                  backdropFilter: 'blur(14px)',
                  WebkitBackdropFilter: 'blur(14px)',
                  border:         '1px solid rgba(255,255,255,0.08)',
                  borderRadius:   8,
                  padding:        '5px 0',
                  zIndex:         200,
                  minWidth:       148,
                }}
              >
                {MODE_ORDER.map(m => (
                  <button
                    key={m}
                    onClick={() => { setMode(m); modeRef.current = m; setModeMenuOpen(false); }}
                    className="flex items-center gap-2.5 w-full font-mono"
                    style={{
                      padding:    '6px 14px',
                      background: m === mode ? 'rgba(255,255,255,0.05)' : 'transparent',
                      border:     'none',
                      cursor:     'pointer',
                      textAlign:  'left',
                    }}
                  >
                    <span style={{
                      width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                      background: m === mode ? MODES[m].color : 'rgba(255,255,255,0.18)',
                    }} />
                    <span style={{
                      fontSize: 11,
                      color: m === mode ? MODES[m].color : 'rgba(255,255,255,0.38)',
                    }}>
                      {MODES[m].label}
                    </span>
                    <span style={{
                      marginLeft: 'auto',
                      fontSize: 10,
                      color: 'rgba(255,255,255,0.2)',
                      letterSpacing: '0.02em',
                    }}>
                      {MODES[m].prompt}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Terminal body ─────────────────────────────────── */}
        {!minimized && (
          <div
            ref={containerRef}
            tabIndex={0}
            onKeyDown={handleKey}
            onClick={() => containerRef.current?.focus()}
            className="flex-1 overflow-hidden outline-none cursor-text"
            style={{ padding: '4px 22px 18px 22px' }}
          >
            <div ref={scrollRef} className="terminal-scroll h-full overflow-y-auto overflow-x-hidden">

              {/* ── Scrollback ─────────────────────────────── */}
              {lines.map((line, idx) => {
                const tier = getTier(idx);
                const fs   = tier === 1 ? 14 : tier === 2 ? 12 : 11;
                const base = tier === 1 ? C.t1Base : tier === 2 ? C.t2Base : C.t3Base;
                return (
                  <motion.div
                    key={line.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.16, ease: 'easeOut' }}
                    className="whitespace-pre-wrap break-all"
                    style={{ fontFamily: FONT, fontSize: fs, lineHeight: 1.7, letterSpacing: '0.015em' }}
                  >
                    {line.segments.length > 0
                      ? line.segments.map((seg, si) => (
                          <span key={si} style={{
                            color:      tier < 3 ? (seg.color ?? base) : base,
                            fontWeight: tier < 3 && seg.bold ? 700 : 400,
                            transition: 'color 0.5s, font-size 0.3s',
                          }}>
                            {seg.text}
                          </span>
                        ))
                      : <span>&nbsp;</span>
                    }
                  </motion.div>
                );
              })}

              {/* ── Active input line ──────────────────────── */}
              <div
                className="flex items-center"
                style={{ fontFamily: FONT, fontSize: 14, lineHeight: 1.7, letterSpacing: '0.015em', marginTop: 2 }}
              >
                {/* Glowing prompt char — updates per mode */}
                <span style={{
                  color:       MODES[mode].color,
                  marginRight: 8,
                  flexShrink:  0,
                  textShadow:  `0 0 10px ${MODES[mode].color}bb, 0 0 22px ${MODES[mode].color}55`,
                  transition:  'color 0.3s, text-shadow 0.3s',
                }}>
                  {MODES[mode].prompt}
                </span>

                {/* Syntax-coloured input tokens */}
                {tokenise(input).map((tok, i) => (
                  <span key={i} style={{ color: tok.color }}>{tok.text}</span>
                ))}

                {/* Blinking block cursor — matches mode colour */}
                <span style={{
                  display:    'inline-block',
                  width:      8,
                  height:     14,
                  marginLeft: 1,
                  flexShrink: 0,
                  background: cursorOn ? MODES[mode].color : 'transparent',
                  boxShadow:  cursorOn ? `0 0 8px ${MODES[mode].color}` : 'none',
                  transition: 'background 0.08s, box-shadow 0.08s, color 0.3s',
                }} />
              </div>

            </div>
          </div>
        )}

      </div>
    </motion.div>
  );
}

// ── Traffic light dot ─────────────────────────────────────────
function Dot({ color, hoverColor, label, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="w-3 h-3 rounded-full flex items-center justify-center transition-colors text-[8px] font-bold"
      style={{ background: hov ? hoverColor : color, color: 'rgba(0,0,0,0.45)' }}
    >
      {hov ? label : null}
    </button>
  );
}
