const delay = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = {
  name: 'deploy',
  description: 'Simulate deploying a project  (e.g. deploy myapp)',
  run: async (args, send) => {
    if (!args.length) {
      return '\r\n\x1b[31m  Usage:\x1b[0m deploy [project-name] [env?]\r\n';
    }

    const project = args[0];
    const env = args[1] || 'production';

    const steps = [
      { ms: 200,  msg: `\x1b[33m$ deploy ${project} --env=${env}\x1b[0m` },
      { ms: 500,  msg: `\x1b[90m→ connecting to deployment server...\x1b[0m` },
      { ms: 600,  msg: `\x1b[90m→ fetching latest commits...\x1b[0m` },
      { ms: 800,  msg: `\x1b[90m→ installing dependencies...\x1b[0m` },
      { ms: 1100, msg: `\x1b[90m→ building project...\x1b[0m` },
      { ms: 600,  msg: `\x1b[90m→ running test suite...\x1b[0m` },
      { ms: 300,  msg: `\x1b[32m→ all tests passed\x1b[0m` },
      { ms: 700,  msg: `\x1b[90m→ optimizing assets...\x1b[0m` },
      { ms: 900,  msg: `\x1b[90m→ uploading to ${env}...\x1b[0m` },
      { ms: 400,  msg: `\x1b[90m→ invalidating CDN cache...\x1b[0m` },
      { ms: 200,  msg: `\x1b[32m→ ${project} deployed successfully\x1b[0m` },
      { ms: 100,  msg: `\x1b[90m  https://${project}.vercel.app\x1b[0m` },
    ];

    send({ type: 'output', data: '' });

    for (const step of steps) {
      await delay(step.ms);
      send({ type: 'output', data: step.msg + '\r\n' });
    }

    send({ type: 'output', data: '' });
    return null;
  },
};
