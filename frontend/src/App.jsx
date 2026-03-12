import { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import TerminalPanel from './components/TerminalPanel';

export default function App() {
  const [visible, setVisible] = useState(true);
  const show = useCallback(() => setVisible(true), []);
  const hide = useCallback(() => setVisible(false), []);

  return (
    // Dark base — shows if bg.jpg hasn't loaded yet
    <div
      className="relative w-screen h-screen overflow-hidden select-none"
      style={{ background: '#06080e' }}
    >
      {/* ── Full blurred photo background ───────────────────
           Drop your image at:  frontend/public/bg.jpg
           Any photo works — dark/moody recommended.
      ──────────────────────────────────────────────────── */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: 'url(/bg.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          // This photo is already dark — moderate blur, keep more of the light
          filter: 'blur(12px) brightness(0.78) saturate(0.9)',
          // Scale up slightly so blurred edges never show
          transform: 'scale(1.08)',
        }}
      />

      {/* ── Overlay — adds depth, kills hot spots ──────────── */}
      <div
        className="absolute inset-0"
        style={{
          background: 'rgba(0, 0, 0, 0.15)',
        }}
      />

      {/* ── Terminal ──────────────────────────────────────── */}
      <AnimatePresence>
        {visible && <TerminalPanel onClose={hide} key="terminal" />}
      </AnimatePresence>

      {/* ── Reopen hint ───────────────────────────────────── */}
      <AnimatePresence>
        {!visible && (
          <motion.button
            key="hint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={show}
            className="absolute bottom-12 left-1/2 -translate-x-1/2 font-mono text-xs tracking-[0.3em] uppercase cursor-pointer transition-colors"
            style={{ color: 'rgba(255,255,255,0.25)' }}
          >
            $ open terminal
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Bottom status bar ─────────────────────────────── */}
      <BottomBar />
    </div>
  );
}

/* ── Bottom status bar ───────────────────────────────────── */
function BottomBar() {
  return (
    <div
      className="absolute bottom-0 left-0 right-0 flex items-center px-8 font-mono text-[11px] tracking-widest"
      style={{
        height: 38,
        // Slight blur/dark so it reads over the photo
        background: 'rgba(0, 0, 0, 0.35)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <span style={{ color: '#00ff88' }}>Ambient Terminal OS</span>
      <span className="mx-3" style={{ color: 'rgba(255,255,255,0.18)' }}>·</span>
      <span style={{ color: 'rgba(255,255,255,0.3)' }}>HumanElement Labs</span>
      <span className="mx-3" style={{ color: 'rgba(255,255,255,0.18)' }}>·</span>
      <span style={{ color: 'rgba(255,255,255,0.18)' }}>v3.1.0</span>
      <div className="flex-1" />
      <span style={{ color: 'rgba(255,255,255,0.15)' }}>node  ·  ws  ·  react  ·  custom renderer</span>
    </div>
  );
}
