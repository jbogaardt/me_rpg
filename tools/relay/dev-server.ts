// A local stand-in for the Cloudflare relay: the same code, in memory, behind a plain HTTP server. Used by the
// Playwright two-player test, and handy for trying online play on your own machine:
//
//   npx tsx tools/relay/dev-server.ts                              # listens on http://localhost:8787
//   VITE_RELAY_URL=http://localhost:8787 npm run dev               # point the game at it
//
// Rooms live only as long as this process does.

import { createServer } from 'node:http';
import { createMemoryRelay } from './memory';

const port = Number(process.env.PORT ?? 8787);
const relay = createMemoryRelay({
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean),
});

createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => {
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers.set(name, value);
    }
    headers.set('cf-connecting-ip', req.socket.remoteAddress ?? 'unknown'); // what Cloudflare would have added
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && chunks.length > 0;
    const request = new Request(`http://localhost:${port}${req.url ?? '/'}`, {
      method: req.method,
      headers,
      body: hasBody ? Buffer.concat(chunks) : undefined,
    });
    void relay.handle(request).then(async (response) => {
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    });
  });
}).listen(port, () => console.log(`relay dev server on http://localhost:${port}`));
