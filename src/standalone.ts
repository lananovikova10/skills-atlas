// The standalone page's backend: the page asks for /api/scan as it does from `serve`, and this
// answers in the browser over live GitHub, with the token given in the page, if any. No Node APIs here.
import { AtlasError } from './core/errors.ts';
import { describeScan } from './core/facets.ts';
import { bearer, openGitHub, parseGitHubUrl, webToken, type Fetch } from './core/github.ts';
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
      const token = bearer(new Headers(input instanceof Request ? input.headers : init?.headers).get('authorization'));
      // raw.githubusercontent.com cannot be sent a token from a page: the files come through the API.
      return json(200, describeScan(await scan(await openGitHub(repo, { fetch: live, ...webToken(token, undefined), filesThroughApi: true }))));
    } catch (error) {
      if (error instanceof AtlasError) return json(400, { error: error.message });
      return json(500, { error: `Unexpected error: ${error instanceof Error ? error.message : String(error)}` });
    }
  };
}
