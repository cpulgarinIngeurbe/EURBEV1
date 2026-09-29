import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120000,
  workers: 1,   // los archivos comparten los emuladores: uno detrás de otro
  use: { baseURL: 'http://localhost:5173', headless: true },
  webServer: [
    { command: 'npx --yes http-server -p 5173 -c-1 .', url: 'http://localhost:5173', reuseExistingServer: true },
  ],
});
