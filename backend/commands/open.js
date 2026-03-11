const SITE_MAP = {
  humanelement: 'humanelement.agency',
  google: 'google.com',
  github: 'github.com',
  vercel: 'vercel.com',
  claude: 'claude.ai',
  anthropic: 'anthropic.com',
  youtube: 'youtube.com',
  x: 'x.com',
  twitter: 'x.com',
  linear: 'linear.app',
  notion: 'notion.so',
};

module.exports = {
  name: 'open',
  description: 'Open a site or URL  (e.g. open humanelement)',
  run: async (args, send) => {
    if (!args.length) {
      return (
        '\r\n\x1b[31m  Usage:\x1b[0m open [site|url]\r\n' +
        `  \x1b[90mAliases: ${Object.keys(SITE_MAP).join('  ')}\x1b[0m\r\n`
      );
    }

    const target = args.join(' ').toLowerCase().trim();
    const domain = SITE_MAP[target] || target;
    const url = /^https?:\/\//.test(domain) ? domain : `https://${domain}`;

    send({ type: 'open', url });
    return `\r\n  \x1b[32m→\x1b[0m Opening \x1b[36m${url}\x1b[0m\r\n`;
  },
};
