/*
 * MIT License
 *
 * Copyright (c) 2026 Rich Markdown Diff Authors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

import { runTests } from "@vscode/test-electron";

async function getPathWithoutSpaces(originalPath: string): Promise<string> {
  if (process.platform !== "win32" || !/\s/.test(originalPath)) {
    return originalPath;
  }

  const junctionPath = path.join(os.tmpdir(), "rich-markdown-diff-tests");

  try {
    await fs.rm(junctionPath, { recursive: true, force: true });
    await fs.symlink(originalPath, junctionPath, "junction");
    return junctionPath;
  } catch (error) {
    console.warn(
      "Failed to create a junction for integration tests. Falling back to the original path.",
      error,
    );
    return originalPath;
  }
}

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = await getPathWithoutSpaces(
      path.resolve(__dirname, "../../"),
    );

    // The path to test runner
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.join(
      extensionDevelopmentPath,
      "out",
      "test",
      "suite",
      "index",
    );
    const runtimeRoot = path.join(
      os.tmpdir(),
      `rich-markdown-diff-host-${Date.now()}`,
    );
    const userDataDir = path.join(runtimeRoot, "user-data");
    const extensionsDir = path.join(runtimeRoot, "extensions");

    await fs.mkdir(userDataDir, { recursive: true });
    await fs.mkdir(extensionsDir, { recursive: true });

    // Download VS Code, unzip it and run the integration test
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        `--user-data-dir=${userDataDir}`,
        `--extensions-dir=${extensionsDir}`,
      ],
    });
  } catch {
    console.error("Failed to run tests");
    process.exit(1);
  }
}

main();
