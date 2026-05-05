import { defineConfig, devices } from "@playwright/test";

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./out/test/visual",
  timeout: 120000,
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [["html", { host: "0.0.0.0", port: 9323, open: "never" }]],

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    // baseURL: 'http://127.0.0.1:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",

    /* Global Snapshot Path */
    screenshot: "only-on-failure",
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: ["--disable-lcd-text", "--force-device-scale-factor=1"],
        },
      },
    },
  ],

  /* Snapshot Path configuration */
  snapshotDir: "./src/test/visual/__screenshots__",
  expect: {
    timeout: 30000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.1,
      threshold: 0.1,
    },
    toMatchSnapshot: {
      maxDiffPixelRatio: 0.1,
      threshold: 0.1,
    },
  },
  /* Standardize snapshot paths to match existing files including OS suffix */
  snapshotPathTemplate:
    "{snapshotDir}/vrt.test.js-snapshots/{arg}-{projectName}-{platform}{ext}",
});
