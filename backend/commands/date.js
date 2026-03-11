module.exports = {
  name: 'date',
  description: 'Show current date',
  run: async () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const dayOfYear = Math.ceil(
      (now - new Date(now.getFullYear(), 0, 1)) / 86400000
    );
    return `\r\n  \x1b[36m${dateStr}\x1b[0m  \x1b[90mDay ${dayOfYear} of ${now.getFullYear()}\x1b[0m\r\n`;
  },
};
