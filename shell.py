#!/usr/bin/env python3
"""
HEL Terminal — a custom interactive shell
"""

import os
import sys
import subprocess
import shlex
import json
import re
from pathlib import Path
from datetime import datetime

from prompt_toolkit import PromptSession
from prompt_toolkit.history import FileHistory
from prompt_toolkit.auto_suggest import AutoSuggestFromHistory
from prompt_toolkit.completion import Completer, Completion, PathCompleter, merge_completers
from prompt_toolkit.lexers import PygmentsLexer
from prompt_toolkit.styles import Style
from prompt_toolkit.formatted_text import HTML
from prompt_toolkit.key_binding import KeyBindings
from prompt_toolkit.filters import Condition

from rich.console import Console
from rich.text import Text
from rich.table import Table
from rich import print as rprint

# ─── Paths ───────────────────────────────────────────────────────────────────

CONFIG_DIR = Path.home() / ".hel"
HISTORY_FILE = CONFIG_DIR / "history"
ALIASES_FILE = CONFIG_DIR / "aliases.json"
CONFIG_FILE = CONFIG_DIR / "config.json"

CONFIG_DIR.mkdir(exist_ok=True)

console = Console()

# ─── Config ──────────────────────────────────────────────────────────────────

DEFAULT_CONFIG = {
    "prompt_style": "default",
    "show_git": True,
    "show_time": False,
    "vi_mode": False,
}


def load_config() -> dict:
    if CONFIG_FILE.exists():
        try:
            return {**DEFAULT_CONFIG, **json.loads(CONFIG_FILE.read_text())}
        except Exception:
            pass
    return DEFAULT_CONFIG.copy()


def save_config(config: dict) -> None:
    CONFIG_FILE.write_text(json.dumps(config, indent=2))


# ─── Aliases ─────────────────────────────────────────────────────────────────

def load_aliases() -> dict:
    if ALIASES_FILE.exists():
        try:
            return json.loads(ALIASES_FILE.read_text())
        except Exception:
            pass
    return {}


def save_aliases(aliases: dict) -> None:
    ALIASES_FILE.write_text(json.dumps(aliases, indent=2))


# ─── Git helpers ─────────────────────────────────────────────────────────────

def git_branch() -> str | None:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True, text=True, timeout=1,
            cwd=os.getcwd()
        )
        if result.returncode == 0:
            branch = result.stdout.strip()
            # Check for dirty state
            dirty = subprocess.run(
                ["git", "status", "--porcelain"],
                capture_output=True, text=True, timeout=1,
                cwd=os.getcwd()
            )
            suffix = "*" if dirty.stdout.strip() else ""
            return branch + suffix
    except Exception:
        pass
    return None


# ─── Prompt ──────────────────────────────────────────────────────────────────

def build_prompt(config: dict) -> HTML:
    cwd = os.getcwd()
    home = str(Path.home())
    display_cwd = cwd.replace(home, "~", 1)

    parts = []

    if config.get("show_time"):
        t = datetime.now().strftime("%H:%M")
        parts.append(f'<time>[{t}] </time>')

    parts.append(f'<path>{display_cwd}</path>')

    if config.get("show_git"):
        branch = git_branch()
        if branch:
            parts.append(f' <git>({branch})</git>')

    parts.append('<prompt> › </prompt>')

    return HTML("".join(parts))


PROMPT_STYLE = Style.from_dict({
    "path":   "#5f87ff bold",
    "git":    "#af875f",
    "prompt": "#ffffff bold",
    "time":   "#888888",
})

# ─── Completer ───────────────────────────────────────────────────────────────

SHELL_BUILTINS = [
    "cd", "exit", "quit", "history", "alias", "unalias", "aliases",
    "export", "echo", "pwd", "help", "clear", "set", "config",
]


def _get_executables() -> list[str]:
    """Return all executables on PATH (cached per session)."""
    exes = set()
    path_dirs = os.environ.get("PATH", "").split(os.pathsep)
    for d in path_dirs:
        try:
            for f in os.scandir(d):
                if f.is_file() and os.access(f.path, os.X_OK):
                    exes.add(f.name)
        except (PermissionError, FileNotFoundError):
            pass
    return sorted(exes)


class ShellCompleter(Completer):
    def __init__(self, aliases: dict):
        self.aliases = aliases
        self._path_completer = PathCompleter(expanduser=True)
        self._exes: list[str] | None = None

    @property
    def exes(self) -> list[str]:
        if self._exes is None:
            self._exes = _get_executables()
        return self._exes

    def get_completions(self, document, complete_event):
        text = document.text_before_cursor
        words = text.split()

        # First word → complete commands
        if not words or (len(words) == 1 and not text.endswith(" ")):
            word = words[0] if words else ""
            candidates = SHELL_BUILTINS + list(self.aliases.keys()) + self.exes
            seen = set()
            for name in candidates:
                if name.startswith(word) and name not in seen:
                    seen.add(name)
                    yield Completion(name, start_position=-len(word))
        else:
            # Subsequent words → complete paths
            yield from self._path_completer.get_completions(document, complete_event)


# ─── Built-in commands ───────────────────────────────────────────────────────

class Shell:
    def __init__(self):
        self.config = load_config()
        self.aliases = load_aliases()
        self.env = os.environ.copy()
        self.last_exit = 0

    # ── cd ────────────────────────────────────────────────────────────────────
    def builtin_cd(self, args: list[str]) -> int:
        target = args[0] if args else str(Path.home())
        target = os.path.expanduser(target)
        try:
            os.chdir(target)
        except FileNotFoundError:
            console.print(f"[red]cd: {target}: No such file or directory[/red]")
            return 1
        except PermissionError:
            console.print(f"[red]cd: {target}: Permission denied[/red]")
            return 1
        return 0

    # ── alias ─────────────────────────────────────────────────────────────────
    def builtin_alias(self, args: list[str]) -> int:
        if not args:
            # List all aliases
            if not self.aliases:
                console.print("[dim]No aliases defined.[/dim]")
            else:
                t = Table(show_header=False, box=None, padding=(0, 2, 0, 0))
                for k, v in sorted(self.aliases.items()):
                    t.add_row(f"[cyan]{k}[/cyan]", f"[dim]=[/dim] {v}")
                console.print(t)
            return 0

        # alias name=value
        joined = " ".join(args)
        if "=" in joined:
            name, _, value = joined.partition("=")
            name = name.strip()
            value = value.strip().strip("'\"")
            self.aliases[name] = value
            save_aliases(self.aliases)
            console.print(f"[green]alias[/green] {name}=[dim]{value}[/dim]")
        else:
            # lookup
            name = args[0]
            if name in self.aliases:
                console.print(f"[cyan]{name}[/cyan]=[dim]{self.aliases[name]}[/dim]")
            else:
                console.print(f"[yellow]No alias named '{name}'[/yellow]")
        return 0

    def builtin_unalias(self, args: list[str]) -> int:
        if not args:
            console.print("[red]unalias: missing name[/red]")
            return 1
        name = args[0]
        if name in self.aliases:
            del self.aliases[name]
            save_aliases(self.aliases)
            console.print(f"[dim]Removed alias '{name}'[/dim]")
        else:
            console.print(f"[yellow]No alias named '{name}'[/yellow]")
        return 0

    # ── export ────────────────────────────────────────────────────────────────
    def builtin_export(self, args: list[str]) -> int:
        for arg in args:
            if "=" in arg:
                key, _, val = arg.partition("=")
                os.environ[key] = val
            else:
                # export existing variable
                if arg in os.environ:
                    os.environ[arg] = os.environ[arg]
        return 0

    # ── config ────────────────────────────────────────────────────────────────
    def builtin_config(self, args: list[str]) -> int:
        if not args:
            t = Table(title="Configuration", show_header=True)
            t.add_column("Key", style="cyan")
            t.add_column("Value", style="yellow")
            for k, v in self.config.items():
                t.add_row(k, str(v))
            console.print(t)
            return 0

        if len(args) == 1:
            key = args[0]
            if key in self.config:
                console.print(f"[cyan]{key}[/cyan] = [yellow]{self.config[key]}[/yellow]")
            else:
                console.print(f"[red]Unknown config key: {key}[/red]")
            return 0

        if len(args) == 2:
            key, val_str = args[0], args[1]
            if key not in self.config:
                console.print(f"[red]Unknown config key: {key}[/red]")
                return 1
            # Type coerce
            current = self.config[key]
            if isinstance(current, bool):
                val = val_str.lower() in ("true", "1", "yes", "on")
            elif isinstance(current, int):
                try:
                    val = int(val_str)
                except ValueError:
                    console.print(f"[red]Expected integer for {key}[/red]")
                    return 1
            else:
                val = val_str
            self.config[key] = val
            save_config(self.config)
            console.print(f"[green]Set[/green] {key} = [yellow]{val}[/yellow]")
            return 0

        return 0

    # ── help ─────────────────────────────────────────────────────────────────
    def builtin_help(self, _args: list[str]) -> int:
        console.print("""
[bold cyan]HEL Terminal[/bold cyan] — built-in commands

  [cyan]cd[/cyan] [path]              Change directory  [dim](~ for home)[/dim]
  [cyan]alias[/cyan] [name[=value]]   List or define aliases
  [cyan]unalias[/cyan] <name>         Remove an alias
  [cyan]export[/cyan] KEY=VALUE       Set an environment variable
  [cyan]config[/cyan] [key [value]]   View or change shell settings
  [cyan]history[/cyan]                Show command history
  [cyan]clear[/cyan]                  Clear the screen
  [cyan]help[/cyan]                   Show this message
  [cyan]exit[/cyan] / [cyan]quit[/cyan]           Exit the shell

[dim]All other input is passed to your system shell.[/dim]

[bold]Settings[/bold]
  show_git   [dim]Show git branch in prompt (true/false)[/dim]
  show_time  [dim]Show clock in prompt (true/false)[/dim]
  vi_mode    [dim]Enable vi key bindings (true/false)[/dim]
""")
        return 0

    # ── Dispatch ──────────────────────────────────────────────────────────────
    def run_builtin(self, cmd: str, args: list[str]) -> int | None:
        match cmd:
            case "cd":
                return self.builtin_cd(args)
            case "alias" | "aliases":
                return self.builtin_alias(args)
            case "unalias":
                return self.builtin_unalias(args)
            case "export":
                return self.builtin_export(args)
            case "config":
                return self.builtin_config(args)
            case "help":
                return self.builtin_help(args)
            case "clear":
                os.system("clear")
                return 0
            case "history":
                # Delegated to session-level below
                return None  # special signal
            case "pwd":
                console.print(os.getcwd())
                return 0
            case "echo":
                print(" ".join(args))
                return 0
            case "exit" | "quit":
                console.print("\n[dim]Goodbye.[/dim]")
                sys.exit(0)
        return None  # not a builtin

    def expand_aliases(self, tokens: list[str]) -> list[str]:
        if not tokens:
            return tokens
        cmd = tokens[0]
        if cmd in self.aliases:
            try:
                expanded = shlex.split(self.aliases[cmd])
            except ValueError:
                expanded = self.aliases[cmd].split()
            return expanded + tokens[1:]
        return tokens

    def execute(self, raw: str) -> int:
        raw = raw.strip()
        if not raw or raw.startswith("#"):
            return 0

        try:
            tokens = shlex.split(raw)
        except ValueError as e:
            console.print(f"[red]parse error: {e}[/red]")
            return 1

        tokens = self.expand_aliases(tokens)
        cmd, *args = tokens

        # Built-ins
        result = self.run_builtin(cmd, args)
        if result is not None:
            return result

        # history special case
        if cmd == "history":
            return 0  # handled by session

        # External command
        try:
            proc = subprocess.run(tokens, env=os.environ)
            return proc.returncode
        except FileNotFoundError:
            console.print(f"[red]{cmd}: command not found[/red]")
            return 127
        except KeyboardInterrupt:
            print()
            return 130
        except PermissionError:
            console.print(f"[red]{cmd}: Permission denied[/red]")
            return 126


# ─── Banner ──────────────────────────────────────────────────────────────────

def print_banner():
    console.print("""
[bold #5f87ff]╔══════════════════════════════╗
║   HEL Terminal  v1.0         ║
║   HumanElement Labs          ║
╚══════════════════════════════╝[/bold #5f87ff]
[dim]Type [/dim][cyan]help[/cyan][dim] for built-in commands. [/dim][dim]Ctrl-D or exit to quit.[/dim]
""")


# ─── Main loop ───────────────────────────────────────────────────────────────

def main():
    print_banner()

    shell = Shell()
    completer = ShellCompleter(shell.aliases)

    session: PromptSession = PromptSession(
        history=FileHistory(str(HISTORY_FILE)),
        auto_suggest=AutoSuggestFromHistory(),
        completer=completer,
        complete_while_typing=True,
        style=PROMPT_STYLE,
        vi_mode=shell.config.get("vi_mode", False),
        mouse_support=False,
    )

    while True:
        try:
            raw = session.prompt(
                lambda: build_prompt(shell.config),
                rprompt=HTML(
                    f'<style fg="#444444">[{shell.last_exit}]</style>'
                ) if shell.last_exit != 0 else None,
            )
        except KeyboardInterrupt:
            print()
            continue
        except EOFError:
            console.print("\n[dim]Goodbye.[/dim]")
            break

        # history built-in needs access to session
        stripped = raw.strip()
        if stripped in ("history",):
            hist = session.history.get_strings()
            for i, line in enumerate(hist[-50:], 1):
                console.print(f"[dim]{i:4d}[/dim]  {line}")
            shell.last_exit = 0
            continue

        shell.last_exit = shell.execute(raw)


if __name__ == "__main__":
    main()
