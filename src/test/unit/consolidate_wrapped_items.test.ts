
import * as assert from "assert";
import { consolidateWrappedItems } from "../../markdown/structuralDiff";

describe("consolidateWrappedItems bug", () => {
    it("should NOT move diff tags outside of <li>", () => {
        const input = '<ul><li><ins class="diffins">Item content</ins></li></ul>';
        const result = consolidateWrappedItems(input);
        
        // If the bug exists, result will be '<ul><ins class="diffins"><li>Item content</li></ins></ul>'
        // which is invalid HTML.
        assert.strictEqual(result.includes('<ul><ins'), false, "Should not move <ins> outside of <li> if inside <ul>");
        assert.strictEqual(result, input, "Should leave <ins> inside <li>");
    });
});
