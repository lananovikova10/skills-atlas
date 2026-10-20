// Builds the standalone page: web/ and the core in one HTML file, with the styles and every script
// inline, that scans GitHub from the browser. `node scripts/build-standalone.ts [<out directory>]`.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const FILE = 'skill-atlas-standalone.html';

/** Writes the page to `<out>/skill-atlas-standalone.html` and `<out>/index.html`; resolves to its path. */
export async function buildStandalone(out: string): Promise<string> {
  const bundle = await build({
    entryPoints: [join(ROOT, 'src/standalone-page.ts')],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    minify: true,
    write: false,
    legalComments: 'eof',
    // web/graph.js imports Cytoscape from the path `serve` answers it at.
    plugins: [{
      name: 'vendor',
      setup: (b) => b.onResolve({ filter: /^\/vendor\/cytoscape\.mjs$/ }, () => ({
        path: join(ROOT, 'node_modules/cytoscape/dist/cytoscape.esm.mjs'),
      })),
    }],
    logLevel: 'warning',
  });
  // `</script` inside the bundle would end the inline script early.
  const script = bundle.outputFiles[0].text.replaceAll('</script', '<\\/script');
  const style = await readFile(join(ROOT, 'web/style.css'), 'utf8');
  const page = (await readFile(join(ROOT, 'web/index.html'), 'utf8'))
    .replace('<link rel="stylesheet" href="/style.css" />', () => `<style>\n${style}</style>`)
    .replace('<script type="module" src="/app.js"></script>', () => `<script type="module">\n${script}</script>`);
  if (page.includes('href="/style.css"') || page.includes('src="/app.js"')) throw new Error('web/index.html no longer matches the build');
  await mkdir(out, { recursive: true });
  await writeFile(join(out, FILE), page);
  await writeFile(join(out, 'index.html'), page);
  return join(out, FILE);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(await buildStandalone(resolve(process.argv[2] ?? join(ROOT, 'dist'))));
}
