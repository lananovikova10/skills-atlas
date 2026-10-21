// The local web view: a page and one JSON endpoint over the same scan as the CLI. Nothing is
// stored; it listens on 127.0.0.1 only, since it can read local directories.
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { AtlasError } from './core/errors.ts';
import { describeScan } from './core/facets.ts';
import { bearer, openGitHub, parseGitHubUrl, webToken, type Fetch } from './core/github.ts';
import { scan, type Source } from './core/scan.ts';
import { openDirectory } from './local.ts';

const WEB = new URL('../web/', import.meta.url);
const CYTOSCAPE = new URL('../node_modules/cytoscape/dist/cytoscape.esm.min.mjs', import.meta.url);

/** The only files served: nothing else on the disk is reachable. */
const FILES: Record<string, { url: URL; type: string }> = {
  '/': { url: new URL('index.html', WEB), type: 'text/html; charset=utf-8' },
  '/style.css': { url: new URL('style.css', WEB), type: 'text/css; charset=utf-8' },
  '/app.js': { url: new URL('app.js', WEB), type: 'text/javascript; charset=utf-8' },
  '/atlas.js': { url: new URL('atlas.js', WEB), type: 'text/javascript; charset=utf-8' },
  '/graph.js': { url: new URL('graph.js', WEB), type: 'text/javascript; charset=utf-8' },
  '/embed.js': { url: new URL('embed.js', WEB), type: 'text/javascript; charset=utf-8' },
  '/map.js': { url: new URL('map.js', WEB), type: 'text/javascript; charset=utf-8' },
  '/mapview.js': { url: new URL('mapview.js', WEB), type: 'text/javascript; charset=utf-8' },
  '/vendor/cytoscape.mjs': { url: CYTOSCAPE, type: 'text/javascript; charset=utf-8' },
};

export type ServeOptions = {
  /** Opens what the user asked to scan, as the CLI does; with the token given in the page, if any. */
  open(input: string, token?: string): Promise<Source>;
  /** 0 picks a free port. */
  port: number;
};

/** What `serve` opens: a GitHub URL with the page's token, else `envToken` (GITHUB_TOKEN); or a directory. */
export function openFromPage({ fetch, envToken }: { fetch: Fetch; envToken?: string }): ServeOptions['open'] {
  return (input, pageToken) =>
    parseGitHubUrl(input) ? openGitHub(input, { fetch, ...webToken(pageToken, envToken) }) : openDirectory(input);
}

/** Starts the server; resolves to it and its URL once it listens. */
export async function startServer({ open, port }: ServeOptions): Promise<{ server: Server; url: string }> {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const send = (status: number, type: string, body: string | Uint8Array) => {
      response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
      response.end(body);
    };
    const json = (status: number, body: unknown) => send(status, 'application/json; charset=utf-8', JSON.stringify(body));

    if (request.method !== 'GET') return json(405, { error: 'Only GET' });
    if (url.pathname === '/api/scan') {
      const repo = url.searchParams.get('repo')?.trim();
      if (!repo) return json(400, { error: 'Usage: /api/scan?repo=<GitHub URL | directory>' });
      try {
        return json(200, describeScan(await scan(await open(repo, bearer(request.headers.authorization)))));
      } catch (error) {
        if (error instanceof AtlasError) return json(400, { error: error.message });
        return json(500, { error: `Unexpected error: ${error instanceof Error ? error.message : String(error)}` });
      }
    }
    const file = FILES[url.pathname];
    if (!file) return json(404, { error: `Not found: ${url.pathname}` });
    try {
      send(200, file.type, await readFile(fileURLToPath(file.url)));
    } catch {
      json(500, { error: `Cannot read ${url.pathname}` });
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', (error: NodeJS.ErrnoException) =>
      reject(error.code === 'EADDRINUSE' ? new AtlasError(`Port ${port} is in use; try --port <another>`) : error),
    );
    server.listen(port, '127.0.0.1', resolve);
  });
  const address = server.address();
  const actual = typeof address === 'object' && address ? address.port : port;
  return { server, url: `http://127.0.0.1:${actual}/` };
}
