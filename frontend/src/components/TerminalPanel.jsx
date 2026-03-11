import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, useDragControls } from 'framer-motion';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';

// ── Config ───────────────────────────────────────────────────
const WS_URL = '/ws';

const PANEL_W = 860;
const PANEL_H = 540;
const TITLE_H = 36;

// High contrast for readability over a blurred photo
const THEME = {
  background:          'transparent',
  foreground:          '#f0f2f8',       // near-white
  cursor:              '#00ff88',
  cursorAccent:        '#000000',
  selectionBackground: 'rgba(0,255,136,0.18)',
  black:               '#1a1a2e',
  red:                 '#ff7b7b',
  green:               '#00ff88',
  yellow:              '#ffd580',
  blue:                '#80c8ff',
  magenta:             '#c678dd',
  cyan:                '#56d4f5',
  white:               '#f0f2f8',
  brightBlack:         '#5a5f78',
  brightRed:           '#ff9999',
  brightGreen:         '#a6e3a1',
  brightYellow:        '#ffe49d',
  brightBlue:          '#a5d6ff',
  brightMagenta:       '#d2a8ff',
  brightCyan:          '#89dceb',
  brightWhite:         '#ffffff',
};

// ── Component ────────────────────────────────────────────────
export default function TerminalPanel({ onClose }) {
  const dragControls = useDragControls();

  const mountRef   = useRef(null);
  const xtermRef   = useRef(null);
  const fitRef     = useRef(null);
  const wsRef      = useRef(null);
  const inputRef   = useRef('');
  const historyRef = useRef([]);
  const histIdxRef = useRef(-1);
  const reconnRef  = useRef(null);

  const [connected, setConnected] = useState(false);
  const [minimized, setMinimized] = useState(false);

  // ── Prompt ──────────────────────────────────────────────
  const writePrompt = useCallback(() => {
    // dim $ so it recedes — the command text is the focus
    xtermRef.current?.write('\r\n\x1b[90m$\x1b[0m ');
  }, []);

  // ── WebSocket ────────────────────────────────────────────
  const connect = useCallback(() => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws    = new WebSocket(`${proto}://${window.location.host}${WS_URL}`);
    wsRef.current = ws;

    ws.onopen = () => { clearTimeout(reconnRef.current); setConnected(true); };

    ws.onmessage = (ev) => {
      const term = xtermRef.current;
      if (!term) return;
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }

      switch (msg.type) {
        case 'output': term.write(msg.data ?? ''); break;
        case 'clear':  term.clear(); break;
        case 'open':   if (msg.url) window.open(msg.url, '_blank', 'noopener'); break;
        case 'prompt': writePrompt(); break;
        default: break;
      }
    };

    ws.onclose = () => { setConnected(false); reconnRef.current = setTimeout(connect, 3000); };
    ws.onerror = ()  => { setConnected(false); };
  }, [writePrompt]);

  // ── xterm init ───────────────────────────────────────────
  useEffect(() => {
    if (!mountRef.current) return;

    const term = new Terminal({
      allowTransparency: true,
      cursorBlink:  true,
      cursorStyle:  'block',
      fontFamily:   '"JetBrains Mono", "Cascadia Code", "Fira Code", Consolas, monospace',
      fontSize:     13,
      lineHeight:   1.75,
      letterSpacing: 0.3,
      scrollback:   3000,
      convertEol:   true,
      theme:        THEME,
    });

    const fitAddon   = new FitAddon();
    const linksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(linksAddon);
    term.open(mountRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitRef.current   = fitAddon;

    // ── Key handler ──────────────────────────────────────
    term.onKey(({ key, domEvent }) => {
      const { keyCode, ctrlKey, altKey, metaKey } = domEvent;

      if (ctrlKey && !altKey && !metaKey) {
        if (keyCode === 67) { inputRef.current = ''; term.write('^C'); writePrompt(); }
        if (keyCode === 76) { term.clear(); writePrompt(); }
        return;
      }
      if (altKey || metaKey) return;

      switch (keyCode) {
        case 13: {
          const cmd = inputRef.current.trim();
          term.write('\r\n');
          if (cmd) {
            historyRef.current.unshift(cmd);
            histIdxRef.current = -1;
            wsRef.current?.readyState === WebSocket.OPEN
              ? wsRef.current.send(JSON.stringify({ type: 'command', input: cmd }))
              : (term.writeln('\x1b[31m  [disconnected — reconnecting…]\x1b[0m'), writePrompt());
          } else {
            writePrompt();
          }
          inputRef.current = '';
          break;
        }
        case 8: {
          if (inputRef.current.length > 0) {
            inputRef.current = inputRef.current.slice(0, -1);
            term.write('\b \b');
          }
          break;
        }
        case 38: {
          const h = historyRef.current;
          if (histIdxRef.current < h.length - 1) {
            histIdxRef.current++;
            const e = h[histIdxRef.current];
            term.write(`\r\x1b[2K\x1b[90m$\x1b[0m ${e}`);
            inputRef.current = e;
          }
          break;
        }
        case 40: {
          if (histIdxRef.current > 0) {
            histIdxRef.current--;
            const e = historyRef.current[histIdxRef.current];
            term.write(`\r\x1b[2K\x1b[90m$\x1b[0m ${e}`);
            inputRef.current = e;
          } else if (histIdxRef.current === 0) {
            histIdxRef.current = -1;
            term.write('\r\x1b[2K\x1b[90m$\x1b[0m ');
            inputRef.current = '';
          }
          break;
        }
        default: {
          if (key.length === 1 && key.charCodeAt(0) >= 32) {
            inputRef.current += key;
            term.write(key);
          }
        }
      }
    });

    const ro = new ResizeObserver(() => { try { fitAddon.fit(); } catch {} });
    if (mountRef.current) ro.observe(mountRef.current);

    connect();

    return () => {
      ro.disconnect();
      term.dispose();
      clearTimeout(reconnRef.current);
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!minimized) setTimeout(() => { try { fitRef.current?.fit(); } catch {} }, 50);
  }, [minimized]);

  const panelH = minimized ? TITLE_H : PANEL_H;

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
      {/* ── Completely transparent shell ─────────────────────
           No background, no border, no shadow.
           The text floats directly over the blurred photo.
      ───────────────────────────────────────────────────── */}
      <div className="w-full h-full flex flex-col overflow-hidden">

        {/* ── Title bar — drag handle ───────────────────── */}
        <div
          onPointerDown={(e) => dragControls.start(e)}
          className="shrink-0 flex items-center px-3 cursor-grab active:cursor-grabbing"
          style={{ height: TITLE_H, userSelect: 'none' }}
        >
          {/* Traffic lights */}
          <div className="flex items-center gap-[7px]">
            <Dot color="#ff5f57" hoverColor="#ff3b30" label="×" onClick={onClose} />
            <Dot color="#febc2e" hoverColor="#ffb800" label="–" onClick={() => setMinimized(v => !v)} />
            <Dot color="#28c840" hoverColor="#1db836" label="+" onClick={() => {}} />
          </div>

          {/* Filename */}
          <div className="flex-1 flex justify-center items-center gap-2">
            <span className="font-mono text-[11px] tracking-wider" style={{ color: 'rgba(255,255,255,0.28)' }}>
              — ambient_os.sh —
            </span>
          </div>

          {/* Connection dot */}
          <div className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: connected ? '#00ff88' : '#ff5f57',
                boxShadow:  connected ? '0 0 5px #00ff88' : 'none',
                transition: 'all 0.3s',
              }}
            />
            <span className="font-mono text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
              {connected ? 'connected' : 'reconnecting'}
            </span>
          </div>
        </div>

        {/* ── Terminal — text floats over photo ─────────── */}
        {!minimized && (
          <div
            className="flex-1 overflow-hidden"
            style={{ padding: '0 16px 16px 16px' }}
          >
            <div ref={mountRef} className="w-full h-full" />
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
