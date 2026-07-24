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

import * as vscode from "vscode";
import * as child_process from "child_process";
import * as path from "path";
import * as readline from "readline";

export interface BlameLine {
  hash: string;
  author: string;
  authorTime: number; // Unix timestamp
  summary: string;
}

export interface BlameInfo {
  lines: { [lineNumber: string]: BlameLine }; // Use plain object for JSON serialization
}

/**
 * Resolves Git blame information for a given file URI.
 */
export async function resolveBlameInfo(
  uri: vscode.Uri,
): Promise<BlameInfo | undefined> {
  if (uri.scheme !== "file") {
    return undefined;
  }

  const fsPath = uri.fsPath;
  const cwd = path.dirname(fsPath);
  const fileName = path.basename(fsPath);

  return new Promise((resolve) => {
    let resolved = false;
    let timer: NodeJS.Timeout | undefined;

    // --porcelain output is easy to parse.
    // Format:
    // <hash> <orig_line> <final_line> <num_lines>
    // author <name>
    // author-time <timestamp>
    // summary <msg>
    // ...
    // filename <name>
    // \t<line_content>
    const child = child_process.spawn("git", ["blame", "--porcelain", "--", fileName], { cwd });

    child.stderr?.resume();

    const rl = readline.createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
    });

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      try {
        rl.close();
      } catch {
        // Ignored
      }
      try {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill();
        }
      } catch {
        // Ignored
      }
    };

    const safeResolve = (value: BlameInfo | undefined) => {
      if (resolved) {
        return;
      }
      resolved = true;
      cleanup();
      resolve(value);
    };

    // 5 seconds timeout to prevent process hang
    timer = setTimeout(() => {
      safeResolve(undefined);
    }, 5000);

    const lines: { [key: string]: BlameLine } = {};
    let currentHash: string | undefined;
    const commitInfo = new Map<string, Partial<BlameLine>>();

    rl.on("line", (line) => {
      if (line.length === 0) {
        return;
      }

      // Check if it's the start of a new line block in the porcelain output
      const headerMatch = line.match(
        /^([0-9a-f]{40,64})\s+(\d+)\s+(\d+)(?:\s+(\d+))?$/,
      );
      if (headerMatch) {
        currentHash = headerMatch[1];
        const finalLineNumber = parseInt(headerMatch[3], 10);

        // If we don't have info for this hash yet, we'll get it from subsequent lines
        if (!commitInfo.has(currentHash)) {
          commitInfo.set(currentHash, { hash: currentHash });
        }

        // Assign this line to the current info (will be filled later)
        const info = commitInfo.get(currentHash)!;
        lines[finalLineNumber.toString()] = info as BlameLine;
        return;
      }

      if (!currentHash) {
        return;
      }
      const info = commitInfo.get(currentHash)!;

      if (line.startsWith("author ")) {
        info.author = line.substring(7);
      } else if (line.startsWith("author-time ")) {
        info.authorTime = parseInt(line.substring(12), 10);
      } else if (line.startsWith("summary ")) {
        info.summary = line.substring(8);
      }
    });

    child.on("error", () => {
      safeResolve(undefined);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        safeResolve(undefined);
      } else {
        safeResolve({ lines });
      }
    });
  });
}
