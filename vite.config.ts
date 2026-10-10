import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

// Dev-only: lets the map editor's "Save to project" button write public/maps/overworld.json directly.
function saveMapPlugin(): Plugin {
  return {
    name: 'save-map',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__save-map', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end('POST only');
        }
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            JSON.parse(body); // refuse to write anything that isn't valid JSON
            fs.writeFileSync(path.resolve('public/maps/overworld.json'), body);
            res.end('ok');
          } catch (err) {
            res.statusCode = 400;
            res.end(String(err));
          }
        });
      });
    },
  };
}

// Relative base so the build works under https://<user>.github.io/<repo>/
export default defineConfig({
  base: './',
  plugins: [saveMapPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve('index.html'),
        editor: path.resolve('editor.html'),
      },
    },
  },
});
