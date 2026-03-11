const os = require('os');

function makeBar(ratio, width = 24) {
  const filled = Math.round(Math.min(ratio, 1) * width);
  const empty = width - filled;
  const color =
    ratio > 0.8 ? '\x1b[31m' : ratio > 0.6 ? '\x1b[33m' : '\x1b[32m';
  return `${color}${'█'.repeat(filled)}\x1b[90m${'░'.repeat(empty)}\x1b[0m`;
}

module.exports = {
  name: 'system',
  description: 'Detailed system stats  (usage: system stats)',
  run: async (args) => {
    const sub = args[0];

    if (sub !== 'stats') {
      return '\r\n\x1b[31m  Usage:\x1b[0m system stats\r\n';
    }

    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const loadAvg = os.loadavg();
    const uptime = os.uptime();

    const memRatio = usedMem / totalMem;
    const cpuRatio = Math.min(loadAvg[0] / cpus.length, 1);

    const lines = [
      '',
      '\x1b[33m  System Statistics\x1b[0m',
      '  ' + '─'.repeat(50),
      `  \x1b[36mCPU Model\x1b[0m    ${cpus[0].model}`,
      `  \x1b[36mCPU Cores\x1b[0m    ${cpus.length}`,
      `  \x1b[36mCPU Load\x1b[0m     ${makeBar(cpuRatio)}  ${loadAvg.map(l => l.toFixed(2)).join(' / ')}`,
      '',
      `  \x1b[36mMemory\x1b[0m       ${makeBar(memRatio)}`,
      `               ${Math.round(usedMem / 1024 / 1024)} MB used  /  ${Math.round(totalMem / 1024 / 1024)} MB total  (${Math.round(memRatio * 100)}%)`,
      `               ${Math.round(freeMem / 1024 / 1024)} MB free`,
      '',
      `  \x1b[36mPlatform\x1b[0m     ${os.platform()} ${os.release()}`,
      `  \x1b[36mArch\x1b[0m         ${os.arch()}`,
      `  \x1b[36mHostname\x1b[0m     ${os.hostname()}`,
      `  \x1b[36mOS Uptime\x1b[0m    ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
      `  \x1b[36mNode.js\x1b[0m      ${process.version}`,
      '',
    ];

    return lines.join('\r\n');
  },
};
