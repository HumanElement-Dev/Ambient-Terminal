module.exports = {
  name: 'clear',
  description: 'Clear the terminal screen',
  run: async (args, send) => {
    send({ type: 'clear' });
    return null;
  },
};
