module.exports = {
  name: 'help',
  description: 'Show available commands',
  run: async (args, send, context) => {
    const commands = context.commands;
    const lines = [
      '',
      '\x1b[33m  Commands\x1b[0m',
      '  ' + '─'.repeat(44),
    ];

    for (const [name, cmd] of commands.entries()) {
      const padded = name.padEnd(16);
      lines.push(`  \x1b[36m${padded}\x1b[0m ${cmd.description || ''}`);
    }

    lines.push('');
    lines.push('  \x1b[90m─ Arrow keys navigate history  ·  Ctrl+L clears  ·  Ctrl+C cancels\x1b[0m');
    lines.push('');

    return lines.join('\r\n');
  },
};
