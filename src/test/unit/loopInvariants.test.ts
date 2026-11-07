/*
 * MIT License
 *
 * Copyright (c) 2026 Rich Markdown Diff Authors
 */

import * as assert from "assert";
import { MarkdownDiffProvider } from "../../markdownDiff";
import {
  areDiffTagsBalanced,
  executeWithFullPipeline,
  hasUnrestoredPipelineTokens,
  verifyDiffIntegrity,
  verifyPipelinePostConditions,
} from "../../markdown/structuralDiff";
import { areHtmlTagsBalanced } from "../../markdown/domUtils";

/**
 * Deterministic Mulberry32 PRNG for reproducible property-based fuzzing.
 */
function createPrng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates diverse Markdown blocks covering the 6 adversarial audit pillars
 * (nested lists, tables, CJK/Unicode, math, Mermaid, alerts, code blocks, footnotes, MDX).
 */
function generateMarkdownBlocks(rng: () => number, count: number): string[] {
  const pick = <T>(arr: readonly T[]): T =>
    arr[Math.floor(rng() * arr.length)];

  const wordsEn = [
    "alpha",
    "beta",
    "gamma",
    "delta",
    "pipeline",
    "invariant",
    "markdown",
    "sensor",
    "actuator",
    "fallback",
  ];
  const wordsCjk = [
    "閉ループ",
    "構造検証",
    "差分解析",
    "日本語テスト",
    "境界条件",
    "再帰処理",
  ];
  const inlineFormats = [
    (w: string) => `**${w}**`,
    (w: string) => `*${w}*`,
    (w: string) => `~~${w}~~`,
    (w: string) => `==${w}==`,
    (w: string) => `\`${w}\``,
    (w: string) => `${w}~sub~`,
    (w: string) => `${w}^sup^`,
    (w: string) => w,
  ];

  const randomSentence = (): string => {
    const len = 2 + Math.floor(rng() * 4);
    const parts: string[] = [];
    for (let i = 0; i < len; i++) {
      const base = rng() < 0.35 ? pick(wordsCjk) : pick(wordsEn);
      parts.push(pick(inlineFormats)(base));
    }
    return parts.join(" ");
  };

  const blocks: string[] = [];
  for (let i = 0; i < count; i++) {
    const kind = Math.floor(rng() * 12);
    switch (kind) {
      case 0: {
        const level = "#".repeat(1 + Math.floor(rng() * 3));
        blocks.push(`${level} ${i + 1}. ${randomSentence()} 🚀`);
        break;
      }
      case 1: {
        blocks.push(`${randomSentence()}.\n${randomSentence()}.`);
        break;
      }
      case 2: {
        const sep = rng() < 0.3 ? "\n\n" : "\n";
        blocks.push(
          [
            `- ${randomSentence()}`,
            `  - ${randomSentence()}`,
            `- ${randomSentence()}`,
          ].join(sep),
        );
        break;
      }
      case 3: {
        blocks.push(
          [
            `1. ${randomSentence()}`,
            `2. ${randomSentence()}`,
            `3. ${randomSentence()}`,
          ].join("\n"),
        );
        break;
      }
      case 4: {
        const c1 = rng() < 0.5 ? "x" : " ";
        const c2 = rng() < 0.5 ? "x" : " ";
        blocks.push(
          `- [${c1}] ${randomSentence()}\n- [${c2}] ${randomSentence()}`,
        );
        break;
      }
      case 5: {
        blocks.push(
          [
            `| ColA | ColB |`,
            `| --- | --- |`,
            `| ${pick(wordsEn)} | ${pick(wordsCjk)} |`,
            `| ${pick(wordsEn)} | ${pick(wordsEn)} |`,
          ].join("\n"),
        );
        break;
      }
      case 6: {
        blocks.push(
          [
            "```javascript",
            `function test_${i}() {`,
            `  return "${pick(wordsEn)}_${pick(wordsCjk)}";`,
            `}`,
            "```",
          ].join("\n"),
        );
        break;
      }
      case 7: {
        const alertType = pick(["NOTE", "WARNING", "TIP", "IMPORTANT"]);
        blocks.push(`> [!${alertType}]\n> ${randomSentence()}`);
        break;
      }
      case 8: {
        blocks.push(`> ${randomSentence()}\n> ${randomSentence()}`);
        break;
      }
      case 9: {
        blocks.push(`$$\nx_${i} = \\frac{a + b}{2}\n$$`);
        break;
      }
      case 10: {
        blocks.push(
          [
            "```mermaid",
            "graph TD",
            `  A[${pick(wordsEn)}] --> B[${pick(wordsCjk)}]`,
            "```",
          ].join("\n"),
        );
        break;
      }
      case 11:
      default: {
        blocks.push("---");
        break;
      }
    }
  }
  return blocks;
}

/**
 * Automatic delta-debugging shrinker for failing Markdown block pairs.
 * Reduces (oldBlocks, newBlocks) to a minimal counterexample that still triggers `failsPredicate`.
 */
function shrinkCounterexample(
  oldBlocks: string[],
  newBlocks: string[],
  failsPredicate: (oldMd: string, newMd: string) => boolean,
): { oldMd: string; newMd: string } {
  let curOld = [...oldBlocks];
  let curNew = [...newBlocks];

  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < curOld.length; i++) {
      if (curOld.length <= 1) {
        break;
      }
      const candidateOld = curOld.filter((_, idx) => idx !== i);
      if (failsPredicate(candidateOld.join("\n\n"), curNew.join("\n\n"))) {
        curOld = candidateOld;
        improved = true;
        break;
      }
    }
    for (let j = 0; j < curNew.length; j++) {
      if (curNew.length <= 1) {
        break;
      }
      const candidateNew = curNew.filter((_, idx) => idx !== j);
      if (failsPredicate(curOld.join("\n\n"), candidateNew.join("\n\n"))) {
        curNew = candidateNew;
        improved = true;
        break;
      }
    }
  }

  return {
    oldMd: curOld.join("\n\n"),
    newMd: curNew.join("\n\n"),
  };
}

describe("Loop Engineering: Closed-Loop Post-Conditions & Property Invariants", () => {
  let provider: MarkdownDiffProvider;

  before(async () => {
    provider = new MarkdownDiffProvider();
    await provider.waitForReady();
  });

  describe("Closed Loop 1: Runtime Post-Condition Sensor & Graceful Degradation", () => {
    it("detects leaked internal tokens while allowing matching literal user content", () => {
      const tokens = { TK0123456789abCODEBLOCK: "<pre>code</pre>" };

      assert.strictEqual(
        hasUnrestoredPipelineTokens(
          "<p>TK0123456789abCODEBLOCK</p>",
          tokens,
          "dataAttrMaskedabc",
          "<p>old</p>",
          "<p>new</p>",
        ),
        true,
        "Should detect unrestored complex block token",
      );

      assert.strictEqual(
        hasUnrestoredPipelineTokens(
          "<p dataAttrMaskedabcx12345678=\"true\">text</p>",
          {},
          "dataAttrMaskedabc",
          "<p>old</p>",
          "<p>new</p>",
        ),
        true,
        "Should detect leaked attribute mask token",
      );

      assert.strictEqual(
        hasUnrestoredPipelineTokens(
          "<p>__PRE_CLEANUP_0_TOKEN__</p>",
          {},
          undefined,
          "<p>old</p>",
          "<p>new</p>",
        ),
        true,
        "Should detect leaked __PRE_CLEANUP_ token",
      );

      assert.strictEqual(
        hasUnrestoredPipelineTokens(
          "<p>PREDIFF_0_abc12345_PLACEHOLDER</p>",
          {},
          undefined,
          "<p>old</p>",
          "<p>new</p>",
        ),
        true,
        "Should detect leaked PREDIFF placeholder",
      );

      // If the user literally wrote the placeholder string in their markdown input, it is not a leak
      assert.strictEqual(
        hasUnrestoredPipelineTokens(
          "<p>__PRE_CLEANUP_0_TOKEN__</p>",
          {},
          undefined,
          "<p>__PRE_CLEANUP_0_TOKEN__</p>",
          "<p>__PRE_CLEANUP_0_TOKEN__</p>",
        ),
        false,
        "Should not flag literal text already present in input HTML",
      );
    });

    it("verifies dual-side content integrity (both new and old sides) including nested diff tags", () => {
      const oldHtml = "<p>Alpha Beta Gamma 削除された日本語</p>";
      const newHtml = "<p>Alpha Beta Delta 追加された日本語</p>";

      const validDiff =
        '<p>Alpha Beta <del class="diffdel">Gamma 削除された日本語</del><ins class="diffins">Delta 追加された日本語</ins></p>';
      assert.strictEqual(
        verifyDiffIntegrity(newHtml, validDiff, "new"),
        true,
        "Valid diff should pass new-side integrity check",
      );
      assert.strictEqual(
        verifyDiffIntegrity(oldHtml, validDiff, "old"),
        true,
        "Valid diff should pass old-side integrity check",
      );

      // Corrupted old-side diff (deleted text dropped completely)
      const droppedOldDiff =
        '<p>Alpha Beta <ins class="diffins">Delta 追加された日本語</ins></p>';
      assert.strictEqual(
        verifyDiffIntegrity(newHtml, droppedOldDiff, "new"),
        true,
        "New-side check alone passes when only old-side words are lost",
      );
      assert.strictEqual(
        verifyDiffIntegrity(oldHtml, droppedOldDiff, "old"),
        false,
        "Old-side integrity check must catch lost deleted content",
      );

      // Nested <del> block where inner </del> would prematurely terminate a naive regex
      const nestedDelDiff =
        '<p><del>Outer <del>Inner</del> MissingNewWord</del> Alpha</p>';
      assert.strictEqual(
        verifyDiffIntegrity("<p>Alpha MissingNewWord</p>", nestedDelDiff, "new"),
        false,
        "Nested <del> stripping must exclude the entire outer <del> region",
      );
    });

    it("degrades gracefully to Stage-1 (pre-refinement snapshot) when post-restoration refinement corrupts output", () => {
      const oldHtml = "<blockquote><p>Shared blockquote words oldWord</p></blockquote>";
      const newHtml = "<blockquote><p>Shared blockquote words newWord</p></blockquote>";

      let callCount = 0;
      const faultyRefinementExecute = (o: string, n: string): string => {
        callCount++;
        if (callCount === 1) {
          // Primary pass: produces valid block-level replacement
          return `<del class="diffdel">${o}</del><ins class="diffins">${n}</ins>`;
        }
        // Recursive refinement pass inside applyStructuralDiffPipeline: simulate catastrophic corruption
        return "<blockquote><p>__PRE_CLEANUP_99_TOKEN__</p></blockquote>";
      };

      const res = executeWithFullPipeline(
        oldHtml,
        newHtml,
        faultyRefinementExecute,
        {},
      );

      assert.strictEqual(
        res.diff.includes("__PRE_CLEANUP_99_TOKEN__"),
        false,
        "Stage-1 degradation must roll back corrupted refinement output",
      );
      assert.ok(
        res.diff.includes("oldWord") && res.diff.includes("newWord"),
        "Stage-1 degraded output must preserve both old and new content",
      );
      assert.strictEqual(
        areDiffTagsBalanced(res.diff),
        true,
        "Stage-1 degraded output must have balanced diff tags",
      );
    });

    it("degrades to Stage-2 (safe raw diff) when primary pass drops old-side content", () => {
      const oldHtml = "<p>CriticalOldContent one two three four five</p>";
      const newHtml = "<p>UpdatedNewContent six seven eight nine ten</p>";

      let callCount = 0;
      const faultyPrimaryExecute = (o: string, n: string): string => {
        callCount++;
        if (callCount === 1) {
          // Primary pass drops oldHtml completely while keeping newHtml (passes new-side check, fails old-side check)
          return `<ins class="diffins">${n}</ins>`;
        }
        // Fallback raw diff pass returns both sides properly
        return `<del class="diffdel">${o}</del><ins class="diffins">${n}</ins>`;
      };

      const res = executeWithFullPipeline(
        oldHtml,
        newHtml,
        faultyPrimaryExecute,
        {},
      );

      assert.ok(
        res.diff.includes("CriticalOldContent"),
        "Stage-2 fallback must recover lost old-side content via raw diff",
      );
      assert.ok(
        res.diff.includes("UpdatedNewContent"),
        "Stage-2 fallback must retain new-side content",
      );
      assert.strictEqual(
        areDiffTagsBalanced(res.diff),
        true,
        "Stage-2 fallback must have balanced diff tags",
      );
    });
  });

  describe("Closed Loop 2: Property-Based & Metamorphic Invariant Fuzzing", () => {
    it("satisfies Identity, Dual-Side Integrity, Tag Balance, Line Bounds, and Time Bounds across 80 generated document pairs", function () {
      this.timeout(10000);
      const rng = createPrng(20261107);
      const NUM_TRIALS = 80;

      for (let trial = 0; trial < NUM_TRIALS; trial++) {
        const numOldBlocks = 2 + Math.floor(rng() * 6);
        const oldBlocks = generateMarkdownBlocks(rng, numOldBlocks);

        // Construct newBlocks by mutating, inserting, deleting, and reordering oldBlocks
        const newBlocks: string[] = [];
        for (const block of oldBlocks) {
          const r = rng();
          if (r < 0.2) {
            // Delete block
            continue;
          } else if (r < 0.55) {
            // Keep block unchanged
            newBlocks.push(block);
          } else {
            // Modify block slightly or replace with a fresh block
            const replacement = generateMarkdownBlocks(rng, 1)[0];
            newBlocks.push(replacement);
          }
          if (rng() < 0.25) {
            // Insert an extra block
            newBlocks.push(generateMarkdownBlocks(rng, 1)[0]);
          }
        }
        if (newBlocks.length === 0) {
          newBlocks.push(generateMarkdownBlocks(rng, 1)[0]);
        }

        const oldMd = oldBlocks.join("\n\n");
        const newMd = newBlocks.join("\n\n");

        // 1. Metamorphic Identity Invariant: computeDiff(oldMd, oldMd) has no diff
        const identityRes = provider.computeDiff(oldMd, oldMd);
        assert.strictEqual(
          identityRes.hasDiff,
          false,
          `[Trial ${trial}] Identity invariant failed: computeDiff(doc, doc).hasDiff should be false`,
        );
        assert.strictEqual(
          /<(ins|del)\b/i.test(identityRes.html),
          false,
          `[Trial ${trial}] Identity invariant failed: computeDiff(doc, doc) should not emit <ins> or <del>`,
        );

        // 2. General Pair Invariants with automatic counterexample shrinking on failure
        const checkInvariants = (
          candidateOld: string,
          candidateNew: string,
        ): { ok: boolean; reason?: string } => {
          try {
            const startMs = Date.now();
            const res = provider.computeDiff(candidateOld, candidateNew);
            const elapsedMs = Date.now() - startMs;

            if (elapsedMs > 500) {
              return {
                ok: false,
                reason: `Execution time bound exceeded: ${elapsedMs}ms > 500ms`,
              };
            }

            if (
              hasUnrestoredPipelineTokens(
                res.html,
                {},
                undefined,
                candidateOld,
                candidateNew,
              )
            ) {
              return {
                ok: false,
                reason: `Leaked internal pipeline token in output: ${res.html}`,
              };
            }

            if (!areDiffTagsBalanced(res.html)) {
              return {
                ok: false,
                reason: `Unbalanced <ins>/<del> diff tags in output: ${res.html}`,
              };
            }

            // Render standalone old and new via computeDiff(x, x) for oracle comparison
            const renderedOld = provider.computeDiff(
              candidateOld,
              candidateOld,
            ).html;
            const renderedNew = provider.computeDiff(
              candidateNew,
              candidateNew,
            ).html;

            if (!verifyDiffIntegrity(renderedNew, res.html, "new")) {
              return {
                ok: false,
                reason: `New-side content integrity failed for diff output`,
              };
            }

            if (!verifyDiffIntegrity(renderedOld, res.html, "old")) {
              return {
                ok: false,
                reason: `Old-side content integrity failed for diff output`,
              };
            }

            // Verify all data-line and data-line-end attributes are non-negative integers within bounds
            const maxLines =
              Math.max(
                candidateOld.split(/\r?\n/).length,
                candidateNew.split(/\r?\n/).length,
              ) + 5;
            const lineAttrRegex = /\bdata-line(-end)?="([^"]*)"/g;
            let m: RegExpExecArray | null;
            while ((m = lineAttrRegex.exec(res.html)) !== null) {
              const val = Number(m[2]);
              if (!Number.isInteger(val) || val < 0 || val > maxLines) {
                return {
                  ok: false,
                  reason: `Invalid data-line${m[1] || ""}="${m[2]}" (maxLines=${maxLines})`,
                };
              }
            }

            return { ok: true };
          } catch (err: any) {
            return {
              ok: false,
              reason: `Uncaught exception: ${err?.message || String(err)}`,
            };
          }
        };

        const initialCheck = checkInvariants(oldMd, newMd);
        if (!initialCheck.ok) {
          const shrunk = shrinkCounterexample(
            oldBlocks,
            newBlocks,
            (o, n) => !checkInvariants(o, n).ok,
          );
          const shrunkCheck = checkInvariants(shrunk.oldMd, shrunk.newMd);
          assert.fail(
            `[Trial ${trial}] Invariant violated: ${shrunkCheck.reason || initialCheck.reason}\n` +
              `--- Shrunk Minimal oldMd ---\n${shrunk.oldMd}\n` +
              `--- Shrunk Minimal newMd ---\n${shrunk.newMd}`,
          );
        }
      }
    });

    it("verifies verifyPipelinePostConditions enforces HTML tag balance non-regression", () => {
      const oldHtml = "<div><p>Hello</p></div>";
      const newHtml = "<div><p>World</p></div>";
      const balancedBaseline =
        '<div><p><del class="diffdel">Hello</del><ins class="diffins">World</ins></p></div>';
      const corruptedUnbalanced =
        '<div><p><del class="diffdel">Hello</del><ins class="diffins">World</ins></div>';

      assert.strictEqual(
        areHtmlTagsBalanced(balancedBaseline),
        true,
        "Baseline should be balanced",
      );
      assert.strictEqual(
        verifyPipelinePostConditions(
          oldHtml,
          newHtml,
          balancedBaseline,
          {},
          undefined,
          balancedBaseline,
        ),
        true,
        "Balanced final HTML should pass post-conditions",
      );
      assert.strictEqual(
        verifyPipelinePostConditions(
          oldHtml,
          newHtml,
          corruptedUnbalanced,
          {},
          undefined,
          balancedBaseline,
        ),
        false,
        "Unbalanced final HTML must fail post-conditions when baseline was balanced",
      );
    });

    it("does not throw YAMLException when Markdown starts with horizontal rule --- followed by blockquote and another ---", () => {
      const docWithLeadingHr = [
        "---",
        "",
        "> blockquote content that is not valid YAML scalar",
        "",
        "---",
        "",
        "# Heading",
      ].join("\n");

      const res = provider.computeDiff(docWithLeadingHr, docWithLeadingHr);
      assert.strictEqual(res.hasDiff, false);
      assert.ok(res.html.includes("blockquote"), "Should render blockquote safely without throwing");
    });
  });
});
