const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const CommandRouter = require('./commandRouter');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });
const router = new CommandRouter();

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', commands: router.getCommandNames() });
});

// CORS headers for dev
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

const BANNER = [
  '',
  `\x1b[90m$ run ambient_os --mode=interactive --year=2026\x1b[0m`,
  `\x1b[90m→ booting Ambient Terminal OS  v1.0.0\x1b[0m`,
  `\x1b[90m→ loaded \x1b[0m\x1b[33m${router.getCommandNames().join('  ')}\x1b[0m`,
  '',
  `\x1b[1mtype \x1b[32mhelp\x1b[0m\x1b[1m to see what this can do.\x1b[0m`,
  '',
].join('\r\n');

wss.on('connection', (ws) => {
  console.log('[ws] client connected');

  const send = (msg) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  };

  // Send welcome banner then prompt
  send({ type: 'output', data: BANNER });
  send({ type: 'prompt' });

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type !== 'command') return;

    const input = (msg.input || '').trim();
    if (!input) {
      send({ type: 'prompt' });
      return;
    }

    try {
      const result = await router.execute(input, send);
      if (result !== null && result !== undefined) {
        send({ type: 'output', data: result });
      }
    } catch (err) {
      send({ type: 'output', data: `\r\n\x1b[31m  Error: ${err.message}\x1b[0m\r\n` });
    }

    send({ type: 'prompt' });
  });

  ws.on('close', () => console.log('[ws] client disconnected'));
  ws.on('error', (err) => console.error('[ws] error:', err.message));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`\n  Ambient Terminal OS — backend`);
  console.log(`  http://localhost:${PORT}\n`);
});
