module.exports = {
  name: 'time',
  description: 'Show current time',
  run: async () => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', {
      hour12: true,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return `\r\n  \x1b[36m${timeStr}\x1b[0m  \x1b[90m${tz}\x1b[0m\r\n`;
  },
};
