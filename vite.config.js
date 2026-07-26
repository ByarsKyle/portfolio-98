import { defineConfig } from 'vite';

/**
 * Vercel turns every file in /api into a serverless function. Vite doesn't, so
 * `npm run dev` would 404 the modem and Internet Explorer would only ever reach
 * the local 1998 pages. This middleware loads the same handler module and hands
 * it the real Node request/response, which is all api/surf.js actually needs.
 * Production never sees this — it is dev-server only.
 */
function apiDev() {
  return {
    name: 'api-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        const [path, qs] = req.url.split('?');
        const name = path.slice('/api/'.length).replace(/\.js$/, '');
        if (!/^[a-z0-9_-]+$/i.test(name)) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${name}.js`);
          req.query = Object.fromEntries(new URLSearchParams(qs ?? ''));
          await mod.default(req, res);
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({
            ok: false, status: 500,
            error: String(err?.message ?? err),
            reason: 'The page cannot be displayed',
          }));
        }
      });
    },
  };
}

export default defineConfig({
  base: '/',
  plugins: [apiDev()],
  server: { host: true, port: 5173 },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0,
    // clerk-js is a big package and we bundle it whole rather than pulling it
    // off Clerk's CDN, because nothing in this project loads from a third party
    // at runtime. It is dynamically imported, so the room never pays for it —
    // only opening Mail or the vault fetches that chunk.
    chunkSizeWarningLimit: 1700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/@clerk')) return 'clerk';
          if (id.includes('node_modules/convex')) return 'convex';
        },
      },
    },
  },
});
