// spec/analysis.md: a scan of JetBrains/intellij-community, its default branch through code search,
// takes under 5 s with GITHUB_TOKEN, the last update of each of its skill files included. A check to run
// with your own token: GitHub throttles code search for the Actions token, so CI skips it; a rate limit
// skips it too, since it is not what is measured.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ATLAS = fileURLToPath(new URL('../../skill-atlas', import.meta.url));

const skip = process.env.CI ? 'CI: GitHub throttles code search for the Actions token' : !process.env.GITHUB_TOKEN && 'needs GITHUB_TOKEN';

test('JetBrains/intellij-community with a token: under 5 s', { skip }, async (t) => {
  const started = performance.now();
  const { code, stdout, stderr } = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    execFile(ATLAS, ['scan', 'https://github.com/JetBrains/intellij-community'], { encoding: 'utf8', timeout: 30_000 }, (error, stdout, stderr) =>
      resolve({ code: error ? Number(error.code ?? 1) : 0, stdout, stderr }),
    );
  });
  const seconds = (performance.now() - started) / 1000;
  if (code !== 0 && /^GitHub rate limit reached/.test(stderr)) return t.skip(stderr.trim());
  assert.equal(code, 0, stderr);
  assert.ok(stdout.includes('\n  updated 20'), stdout);
  assert.ok(!stderr.includes('last updated unknown'), stderr);
  assert.ok(seconds < 5, `${seconds.toFixed(1)} s`);
});
