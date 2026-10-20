// The standalone page's backend: the page asks for /api/scan as it does from `serve`, and this
// answers in the browser over live GitHub, without a token. No Node APIs here.
import { AtlasError } from './core/errors.ts';
import { describeScan } from './core/facets.ts';
import { openGitHub, parseGitHubUrl, type Fetch } from './core/github.ts';
import { scan } from './core/scan.ts';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

/** A fetch that answers /api/scan itself and passes everything else to `live`. */
export function standaloneFetch(live: Fetch): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://standalone/');
    if (url.host !== 'standalone' || url.pathname !== '/api/scan') return live(String(input), init as { headers?: Record<string, string> });
    const repo = url.searchParams.get('repo')?.trim() ?? '';
    if (!repo) return json(400, { error: 'Usage: /api/scan?repo=<GitHub URL>' });
    if (!parseGitHubUrl(repo)) return json(400, { error: `This standalone page scans GitHub repositories only: ${repo}` });
    try {
      return json(200, describeScan(await scan(await openGitHub(repo, { fetch: live }))));
    } catch (error) {
      if (error instanceof AtlasError) return json(400, { error: error.message });
      return json(500, { error: `Unexpected error: ${error instanceof Error ? error.message : String(error)}` });
    }
  };
}
