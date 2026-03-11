module.exports = {
  name: 'echo',
  description: 'Echo text to the terminal',
  run: async (args) => {
    if (!args.length) return '\r\n\r\n';
    return `\r\n  ${args.join(' ')}\r\n`;
  },
};
