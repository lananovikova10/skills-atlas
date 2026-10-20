// The browser tests: the demo in docs/demo, played on the real web view with GitHub answering from
// a recording, so every run sees the same data, in the same viewport and fonts, and is recorded.
import { defineConfig, devices } from '@playwright/test';

const PORT = 4174;
const SIZE = { width: 1280, height: 800 };

export default defineConfig({
  testDir: 'tests/browser',
  // Nothing in them may depend on chance: a failure is a failure, not a retry.
  retries: 0,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${PORT}/`,
    viewport: SIZE,
    deviceScaleFactor: 1,
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'UTC',
    // Every run is recorded: the video is in test-results/, and in the CI run's artifacts.
    video: { mode: 'on', size: SIZE },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium' }],
  webServer: {
    command: `node tests/browser/server.ts ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
  },
});
