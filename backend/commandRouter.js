const fs = require('fs');
const path = require('path');

class CommandRouter {
  constructor() {
    this.commands = new Map();
    this.loadCommands();
  }

  loadCommands() {
    const commandsDir = path.join(__dirname, 'commands');
    if (!fs.existsSync(commandsDir)) {
      console.warn('[router] commands/ directory not found');
      return;
    }

    const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'));
    for (const file of files) {
      try {
        const command = require(path.join(commandsDir, file));
        if (command.name && typeof command.run === 'function') {
          this.commands.set(command.name, command);
          console.log(`[router] loaded: ${command.name}`);
        }
      } catch (err) {
        console.error(`[router] failed to load ${file}:`, err.message);
      }
    }
  }

  async execute(input, send) {
    const parts = input.trim().split(/\s+/);
    const cmdName = parts[0].toLowerCase();
    const args = parts.slice(1);

    const command = this.commands.get(cmdName);
    if (!command) {
      return (
        `\r\n\x1b[31m  Command not found: \x1b[0m${cmdName}\r\n` +
        `  Type \x1b[33mhelp\x1b[0m to see available commands.\r\n`
      );
    }

    const context = { commands: this.commands };
    try {
      return await command.run(args, send, context);
    } catch (err) {
      return `\r\n\x1b[31m  Error: ${err.message}\x1b[0m\r\n`;
    }
  }

  getCommandNames() {
    return Array.from(this.commands.keys());
  }
}

module.exports = CommandRouter;
