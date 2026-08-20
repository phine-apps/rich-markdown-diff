import * as assert from "assert";
import {
  parseConflictBlocks,
  reconstructDocument,
  renderConflictBlocks,
  getConflictResolverShellHtml,
} from "../../markdown/conflictParser";

describe("Conflict Parser", () => {
  it("should parse normal document without conflict markers as single common block", () => {
    const text = "Hello World\nThis is normal text.";
    const blocks = parseConflictBlocks(text);
    assert.strictEqual(blocks.length, 1);
    assert.strictEqual(blocks[0].type, "common");
    if (blocks[0].type === "common") {
      assert.strictEqual(blocks[0].text, text);
    }
  });

  it("should parse document with single conflict marker into common and conflict blocks", () => {
    const text = `Line 1
<<<<<<< HEAD
Mine content
=======
Theirs content
>>>>>>> feature
Line 2`;

    const blocks = parseConflictBlocks(text);
    assert.strictEqual(blocks.length, 3);
    assert.strictEqual(blocks[0].type, "common");
    assert.strictEqual(blocks[1].type, "conflict");
    assert.strictEqual(blocks[2].type, "common");

    if (blocks[1].type === "conflict") {
      assert.strictEqual(blocks[1].mine, "Mine content");
      assert.strictEqual(blocks[1].theirs, "Theirs content");
      assert.strictEqual(blocks[1].mineLabel, "HEAD");
      assert.strictEqual(blocks[1].theirsLabel, "feature");
    }
  });

  it("should reconstruct document correctly when choices are made", () => {
    const text = `Line 1
<<<<<<< HEAD
Mine content
=======
Theirs content
>>>>>>> feature
Line 2`;

    const blocks = parseConflictBlocks(text);
    if (blocks[1].type === "conflict") {
      blocks[1].choice = "mine";
    }

    const reconstructedMine = reconstructDocument(blocks);
    assert.strictEqual(reconstructedMine, "Line 1\nMine content\nLine 2");

    if (blocks[1].type === "conflict") {
      blocks[1].choice = "theirs";
    }
    const reconstructedTheirs = reconstructDocument(blocks);
    assert.strictEqual(reconstructedTheirs, "Line 1\nTheirs content\nLine 2");
  });

  it("should reconstruct document without extraneous blank lines when choosing empty deletion side", () => {
    const text = `Line 1
<<<<<<< HEAD
=======
Incoming addition
>>>>>>> feature
Line 2`;

    const blocks = parseConflictBlocks(text);
    if (blocks[1].type === "conflict") {
      blocks[1].choice = "mine"; // mine is empty (deletion)
    }

    const reconstructed = reconstructDocument(blocks);
    assert.strictEqual(reconstructed, "Line 1\nLine 2");
  });

  it("should parse conflict markers inside code blocks", () => {
    const text = `\`\`\`typescript
<<<<<<< HEAD
const x = 1;
=======
const x = 2;
>>>>>>> main
\`\`\``;

    const blocks = parseConflictBlocks(text);
    assert.strictEqual(blocks.length, 3);
    assert.strictEqual(blocks[0].type, "common");
    assert.strictEqual(blocks[1].type, "conflict");
    assert.strictEqual(blocks[2].type, "common");
    if (blocks[1].type === "conflict") {
      assert.strictEqual(blocks[1].mine, "const x = 1;");
      assert.strictEqual(blocks[1].theirs, "const x = 2;");
    }
  });

  it("should support diff3 conflict marker format with base section", () => {
    const text = `<<<<<<< HEAD
Mine content
||||||| merged common ancestors
Base content
=======
Theirs content
>>>>>>> branch`;

    const blocks = parseConflictBlocks(text);
    assert.strictEqual(blocks.length, 1);
    assert.strictEqual(blocks[0].type, "conflict");
    if (blocks[0].type === "conflict") {
      assert.strictEqual(blocks[0].mine, "Mine content");
      assert.strictEqual(blocks[0].base, "Base content");
      assert.strictEqual(blocks[0].theirs, "Theirs content");
    }
  });

  it("should safely rescue unclosed conflict marker at EOF", () => {
    const text = `Start
<<<<<<< HEAD
Unclosed mine content`;

    const blocks = parseConflictBlocks(text);
    assert.strictEqual(blocks.length, 2);
    assert.strictEqual(blocks[0].type, "common");
    assert.strictEqual(blocks[1].type, "common");
    assert.ok(blocks[1].text.includes("Unclosed mine content"));
  });

  it("should render conflict buttons with data attributes and no inline onclick handlers", () => {
    const text = `<<<<<<< HEAD
Mine content
=======
Theirs content
>>>>>>> feature`;
    const blocks = parseConflictBlocks(text);

    const html = renderConflictBlocks(blocks);

    // Verify buttons have .btn-resolve and data attributes
    assert.ok(html.includes('class="btn-resolve"'), "Buttons should have btn-resolve class");
    assert.ok(html.includes('data-block-id="conflict-1"'), "Buttons should have data-block-id attribute");
    assert.ok(html.includes('data-choice="mine"'), "Accept Mine button should have data-choice='mine'");
    assert.ok(html.includes('data-choice="theirs"'), "Accept Theirs button should have data-choice='theirs'");
    assert.ok(html.includes('data-choice="both"'), "Accept Both button should have data-choice='both'");

    // Crucial: Ensure NO inline onclick attributes are generated (blocked by CSP)
    assert.strictEqual(html.includes("onclick="), false, "HTML must not contain inline onclick attributes");
  });

  it("should not lose data when encountering consecutive conflict start markers without closure", () => {
    const text = `Line A
<<<<<<< HEAD
Important Line 1
<<<<<<< SUB
Important Line 2
=======
Incoming addition
>>>>>>> branch
Line B`;

    const blocks = parseConflictBlocks(text);
    assert.strictEqual(blocks.length, 4);
    assert.strictEqual(blocks[0].type, "common");
    assert.strictEqual(blocks[0].text, "Line A");

    assert.strictEqual(blocks[1].type, "common");
    assert.ok(blocks[1].text.includes("Important Line 1"), "First unclosed block content must be preserved in rescued common block");
    assert.ok(blocks[1].text.includes("<<<<<<< HEAD"));

    assert.strictEqual(blocks[2].type, "conflict");
    if (blocks[2].type === "conflict") {
      assert.strictEqual(blocks[2].mine, "Important Line 2");
      assert.strictEqual(blocks[2].theirs, "Incoming addition");
      assert.strictEqual(blocks[2].mineLabel, "SUB");
      assert.strictEqual(blocks[2].theirsLabel, "branch");
    }

    assert.strictEqual(blocks[3].type, "common");
    assert.strictEqual(blocks[3].text, "Line B");

    // Verify reconstruction retains all text
    const reconstructed = reconstructDocument(blocks);
    assert.ok(reconstructed.includes("Important Line 1"));
    assert.ok(reconstructed.includes("Important Line 2"));
  });

  it("should treat out-of-order base markers after separator as normal content without corruption", () => {
    const text = `<<<<<<< HEAD
Mine
=======
Theirs line 1
||||||| rogue marker
Theirs line 2
>>>>>>> feature`;

    const blocks = parseConflictBlocks(text);
    assert.strictEqual(blocks.length, 1);
    assert.strictEqual(blocks[0].type, "conflict");
    if (blocks[0].type === "conflict") {
      assert.strictEqual(blocks[0].mine, "Mine");
      assert.strictEqual(
        blocks[0].theirs,
        "Theirs line 1\n||||||| rogue marker\nTheirs line 2",
      );
    }
  });

  it("should generate shell HTML with CSP nonce and event delegation for .btn-resolve", () => {
    const nonce = "test-nonce-12345";

    const shellHtml = getConflictResolverShellHtml(nonce);

    assert.ok(shellHtml.includes(`script-src 'nonce-${nonce}'`), "Shell HTML should include CSP nonce");
    assert.ok(shellHtml.includes(".btn-resolve"), "Shell HTML script should delegate clicks on .btn-resolve");
    assert.ok(shellHtml.includes("resolveConflict"), "Shell HTML should define resolveConflict function");
  });
});
