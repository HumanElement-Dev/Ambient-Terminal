const os = require('os');

function makeBar(ratio, width = 20) {
  const filled = Math.round(Math.min(ratio, 1) * width);
  const empty = width - filled;
  const color =
    ratio > 0.8 ? '\x1b[31m' : ratio > 0.6 ? '\x1b[33m' : '\x1b[32m';
  return `${color}${'█'.repeat(filled)}\x1b[90m${'░'.repeat(empty)}\x1b[0m`;
}

module.exports = {
  name: 'status',
  description: 'Show system status overview',
  run: async () => {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memRatio = usedMem / totalMem;

    const uptime = os.uptime();
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const s = Math.floor(uptime % 60);

    const lines = [
      '',
      '\x1b[33m  Status\x1b[0m',
      '  ' + '─'.repeat(44),
      `  \x1b[36mPlatform\x1b[0m   ${os.platform()} ${os.release()} (${os.arch()})`,
      `  \x1b[36mHostname\x1b[0m   ${os.hostname()}`,
      `  \x1b[36mUptime\x1b[0m     ${h}h ${m}m ${s}s`,
      `  \x1b[36mCPU\x1b[0m        ${os.cpus().length} cores — ${os.cpus()[0].model}`,
      `  \x1b[36mMemory\x1b[0m     ${makeBar(memRatio)}  ${Math.round(usedMem / 1024 / 1024)} / ${Math.round(totalMem / 1024 / 1024)} MB`,
      `  \x1b[36mNode.js\x1b[0m    ${process.version}`,
      '',
    ];

    return lines.join('\r\n');
  },
};
