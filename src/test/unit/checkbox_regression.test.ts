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

import * as assert from "assert";
import { MarkdownDiffProvider } from "../../markdownDiff";

describe("Checkbox Regression Test", () => {
    let provider: MarkdownDiffProvider;

    before(async () => {
        provider = new MarkdownDiffProvider();
        await provider.waitForReady();
    });

    it("should not mangle task list checkboxes in a multi-task scenario", () => {
        const oldMd = `- [ ] Task 1\n- [ ] Task 2`;
        const newMd = `- [ ] Task 1\n- [ ] Task 3`;

        const { html: diffHtml } = provider.computeDiff(oldMd, newMd);
        if (process.env.DEBUG_TEST) { console.log("DEBUG CHECKBOX DIFF HTML:", diffHtml); }

        // Robust scan for mangled attributes: 
        // We look for the characteristic class string that is NOT inside a properly matched tag.
        // A simple way is to check if it's preceded by characters that shouldn't be there in a tag.
        // Or more simply, check if it's NOT part of a valid <input ...> tag.
        
        const cleanHtml = diffHtml.replace(/<input[^>]+>/g, "[INPUT_TAG]");
        const hasRawAttributesFragments = /-list-item-checkbox"/.test(cleanHtml);
        
        assert.strictEqual(hasRawAttributesFragments, false, "HTML attribute fragments should not be exposed outside of valid tags");

        // Verify that we have valid input tags restored
        const inputTags = diffHtml.match(/<input[^>]+>/g);
        assert.ok(inputTags && inputTags.length >= 2, "Should contain at least 2 input tags");
        
        // Ensure no input tag is partially matched across <del> or <ins>
        const hasIllegalSplit = /<input[^>]+<(del|ins)/i.test(diffHtml);
        assert.strictEqual(hasIllegalSplit, false, "Input tags should not be split by diff tags");
    });
  it('should restore tokens even if their casing is changed by htmldiff', () => {
    // We'll reach into the internal executeWithFullPipeline via computeDiff (indirectly)
    // Or we can just test structuralDiff functions directly.
    const html = "<div>zChEcKbOxZh12345678z</div>"; // Mangled casing
    const tokens = { "zcheckboxzh12345678z": '<input type="checkbox" />' };
    
    const { restoreComplexTokens } = require('../../markdown/structuralDiff');
    const restored = restoreComplexTokens(html, tokens);
    
    assert.strictEqual(restored.includes('<input type="checkbox" />'), true, "Should restore token despite mangled casing");
    assert.strictEqual(restored.includes('zChEcKbOxZ'), false, "Token string should be gone");
  });
});
