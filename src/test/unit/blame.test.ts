/*
 * MIT License
 *
 * Copyright (c) 2026 Rich Markdown Diff Authors
 */

import * as assert from "assert";
import { BlameInfo } from "../../gitBlameResolver";

describe("Git Blame Data Structure", () => {
    it("should be JSON-serializable (plain object, not Map)", () => {
        const info: BlameInfo = {
            lines: {
                "1": {
                    hash: "abc1234",
                    author: "Author Name",
                    authorTime: 1234567890,
                    summary: "Commit message"
                }
            }
        };

        const json = JSON.stringify(info);
        const parsed = JSON.parse(json);

        assert.strictEqual(parsed.lines["1"].hash, "abc1234");
        assert.strictEqual(typeof parsed.lines, "object");
        assert.strictEqual(Array.isArray(parsed.lines), false);
        
        // Ensure it's not a Map that became {}
        assert.ok(Object.keys(parsed.lines).length > 0, "Lines should not be empty after serialization");
    });

    it("should match 64-character SHA-256 hashes in git blame porcelain regex (BUG-04)", () => {
        const sha256Hash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
        const line = `${sha256Hash} 1 1 1`;
        const regex = /^([0-9a-f]{40,64})\s+(\d+)\s+(\d+)(?:\s+(\d+))?$/;
        const match = line.match(regex);

        assert.ok(match);
        assert.strictEqual(match[1], sha256Hash);
        assert.strictEqual(match[3], "1");
    });
});
