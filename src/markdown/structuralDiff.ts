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

import * as crypto from "crypto";
import { diffTables } from "./tableDiff";
import { findClosing } from "./domUtils";
import { computeMermaidDiff } from "./mermaidDiff";
import { escapeHtml } from "./sanitizer";

/**
 * Main entrance for computing granular HTML diffs.
 */
export function diffHtmlFragments(
  oldHtml: string,
  newHtml: string,
  execute: (old: string, newVal: string) => string,
  options: {
    allTokens?: Record<string, string>;
    skipRefinement?: boolean;
    tokenizeCodeBlocks?: boolean;
    tokenizeListContainers?: boolean;
  } = {},
): string {
  // Use the full tokenization pipeline in fragments to prevent mangling complex blocks
  return executeWithFullPipeline(
    oldHtml,
    newHtml,
    execute,
    options.allTokens || {},
    {
      skipRefinement: options.skipRefinement,
      tokenizeCodeBlocks: options.tokenizeCodeBlocks,
      tokenizeListContainers: options.tokenizeListContainers,
    },
  ).diff;
}

/**
 * Executes a diff with the full tokenization/restoration pipeline.
 * Used by both computeDiff and internal fragment diffing.
 */
export function executeWithFullPipeline(
  oldHtml: string,
  newHtml: string,
  execute: (old: string, newVal: string) => string,
  allTokens: Record<string, string>,
  options: {
    skipRefinement?: boolean;
    tokenizeCodeBlocks?: boolean;
    tokenizeListContainers?: boolean;
  } = {},
): { diff: string; tokens: Record<string, string> } {
  // 1. Identify complex blocks FIRST to protect them from fragmentation
  const tokenizeCodeBlocks = options.tokenizeCodeBlocks !== false;
  const tokenizeListContainers = options.tokenizeListContainers ?? false;
  const { html: oldT, tokens: t1 } = replaceComplexBlocksWithTokens(oldHtml, {
    tokenizeCodeBlocks,
    tokenizeListContainers,
  });
  const { html: newT, tokens: t2 } = replaceComplexBlocksWithTokens(newHtml, {
    tokenizeCodeBlocks,
    tokenizeListContainers,
  });

  // 2. Mask block attributes to prevent noise from IDs, classes, and line numbers
  const sharedToken = `dataAttrMasked${Math.random().toString(36).substring(2, 10)}`;
  const { masked: oldMasked, attributePools: oldPools } = maskBlockAttributes(
    oldT,
    sharedToken,
  );
  const { masked: newMasked, attributePools: newPools } = maskBlockAttributes(
    newT,
    sharedToken,
  );

  // 3. Materialize checkboxes into text to ensure htmldiff detects state changes
  const { html: oldM, tokens: cbTokensOld } = materializeCheckboxes(oldMasked);
  const { html: newM, tokens: cbTokensNew } = materializeCheckboxes(newMasked);

  const localTokens = {
    ...allTokens,
    ...t1,
    ...t2,
    ...cbTokensOld,
    ...cbTokensNew,
  };

  let diff: string;
  const CHUNK_THRESHOLD = 50000;

  if (oldM.length + newM.length > CHUNK_THRESHOLD) {
    diff = chunkedExecute(oldM, newM, execute);
    // Restore the original attributes into the diff IMMEDIATELY after chunked diffing
    // to ensure all segments (including those that bypassed the callback) are restored.
    diff = restoreBlockAttributes(diff, oldPools, newPools, sharedToken);
  } else {
    diff = execute(oldM, newM);
    // Restore the original attributes into the diff IMMEDIATELY after htmldiff
    // to prevent structural manipulations (like nesting fixes and block consolidation)
    // from causing pointer drift.
    diff = restoreBlockAttributes(diff, oldPools, newPools, sharedToken);
  }

  // Apply pre-restoration fixes (like nesting)
  diff = applyPreRestorePipeline(diff);

  // 4. Token restoration
  // We restore all tokens (including SECTION) before the structural pipeline
  // to allow refineBlockDiffs to granularly diff slide content.
  let restored = restoreComplexTokens(diff, localTokens);

  // --- CONTENT INTEGRITY GUARD ---
  // If the complex pipeline caused data loss (e.g. htmldiff failed to align correctly),
  // fallback to a safe raw diff. We check after restoration so we can see the words.
  if (!verifyDiffIntegrity(newHtml, restored)) {
    console.warn(
      "Structural diff failed integrity check. Falling back to raw diff.",
    );
    let fallbackDiff = execute(oldHtml, newHtml);
    // Even in fallback, we still want to apply basic cleanup to ensure valid HTML
    fallbackDiff = fixInvalidNesting(fallbackDiff);
    return { diff: fallbackDiff, tokens: {} };
  }

  // 5. Restore checkboxes
  restored = restoreCheckboxes(restored, cbTokensNew);

  // Apply post-restoration refinements (like list Ghost items)
  if (!options.skipRefinement) {
    restored = applyStructuralDiffPipeline(restored, execute, localTokens);
  }

  restored = normalizeMathBlockDiffs(restored);
  return { diff: restored, tokens: localTokens };
}

/**
 * Splits HTML into sections based on headers (h1-h3).
 */
export function splitBySections(
  html: string,
): { header: string; headerText: string; content: string; full: string }[] {
  const sections: {
    header: string;
    headerText: string;
    content: string;
    full: string;
  }[] = [];

  const getHeaderText = (h: string) => h.replace(/<[^>]+>/g, "").trim();

  let i = 0;
  let lastIndex = 0;

  while (i < html.length) {
    if (html[i] === "<") {
      // Look for a section-splitting header (h1-h3) at the CURRENT level
      const hMatch = html.substring(i).match(/^<(h[1-3])\b[^>]*>/i);
      if (hMatch) {
        const tagName = hMatch[1];
        const closingPos = findClosing(html, i, tagName);

        if (closingPos !== -1) {
          // 1. Content BEFORE this header belongs to the PREVIOUS section
          if (i > lastIndex) {
            const prevContent = html.substring(lastIndex, i);
            if (sections.length === 0) {
              sections.push({
                header: "",
                headerText: "",
                content: prevContent,
                full: prevContent,
              });
            } else {
              sections[sections.length - 1].content += prevContent;
              sections[sections.length - 1].full += prevContent;
            }
          }

          // 2. Start a new section with this header
          const headerFull = html.substring(i, closingPos);
          sections.push({
            header: headerFull,
            headerText: getHeaderText(headerFull),
            content: "",
            full: headerFull,
          });

          i = closingPos;
          lastIndex = i;
          continue;
        }
      }

    }
    i++;
  }

  // 4. Final trailing content
  if (lastIndex < html.length) {
    const finalContent = html.substring(lastIndex);
    if (sections.length === 0) {
      sections.push({
        header: "",
        headerText: "",
        content: finalContent,
        full: finalContent,
      });
    } else {
      sections[sections.length - 1].content += finalContent;
      sections[sections.length - 1].full += finalContent;
    }
  }

  return sections;
}

/**
 * Aligns two sequences using LCS algorithm.
 */
export function lcsAlignment<T>(
  oldSeq: T[],
  newSeq: T[],
  isEqual: (a: T, b: T) => boolean,
): { oldIdx: number; newIdx: number }[] {
  const n = oldSeq.length;
  const m = newSeq.length;

  if (n === 0 || m === 0) {
    return [];
  }

  const stride = m + 1;
  const dp = new Int32Array((n + 1) * stride);

  for (let i = 1; i <= n; i++) {
    const rowOffset = i * stride;
    const prevRowOffset = (i - 1) * stride;
    for (let j = 1; j <= m; j++) {
      if (isEqual(oldSeq[i - 1], newSeq[j - 1])) {
        dp[rowOffset + j] = dp[prevRowOffset + j - 1] + 1;
      } else {
        const val1 = dp[prevRowOffset + j];
        const val2 = dp[rowOffset + j - 1];
        dp[rowOffset + j] = val1 >= val2 ? val1 : val2;
      }
    }
  }

  const alignment: { oldIdx: number; newIdx: number }[] = [];
  let i = n;
  let j = m;

  while (i > 0 && j > 0) {
    if (isEqual(oldSeq[i - 1], newSeq[j - 1])) {
      alignment.push({ oldIdx: i - 1, newIdx: j - 1 });
      i--;
      j--;
    } else {
      const val1 = dp[(i - 1) * stride + j];
      const val2 = dp[i * stride + j - 1];
      if (val1 >= val2) {
        i--;
      } else {
        j--;
      }
    }
  }

  return alignment.reverse();
}

export function splitByBlocks(
  html: string,
): { header: string; headerText: string; content: string; full: string }[] {
  const sections: {
    header: string;
    headerText: string;
    content: string;
    full: string;
  }[] = [];

  let i = 0;
  let lastIndex = 0;
  let nesting = 0;

  const CHUNK_SIZE_TARGET = 5000;

  while (i < html.length) {
    if (html[i] === "<") {
      if (html.substring(i, i + 4) === "<!--") {
        const endComment = html.indexOf("-->", i + 4);
        if (endComment !== -1) {
          i = endComment + 3;
          continue;
        }
      }

      if (html[i + 1] === "/") {
        nesting = Math.max(0, nesting - 1);
        const endTag = html.indexOf(">", i);
        if (endTag !== -1) {
          i = endTag + 1;
          continue;
        }
      } else if (html[i + 1] !== "!" && html[i + 1] !== "?") {
        const match = html.substring(i).match(/^<([a-z0-9]+)\b/i);
        if (match) {
          const tagName = match[1].toLowerCase();
          const isVoid = ["img", "br", "hr", "meta", "link", "input"].includes(tagName);
          const endOfTag = html.indexOf(">", i);
          const isSelfClosing = endOfTag !== -1 && html[endOfTag - 1] === "/";
          if (!isVoid && !isSelfClosing) {
            nesting++;
          }
          if (endOfTag !== -1) {
            i = endOfTag + 1;
            continue;
          }
        }
      }
    }

    i++;

    // Split at top-level block boundaries when we exceed target size
    if (nesting === 0 && (i - lastIndex) >= CHUNK_SIZE_TARGET) {
      const part = html.substring(lastIndex, i);
      sections.push({
        header: "",
        headerText: "",
        content: part,
        full: part,
      });
      lastIndex = i;
    }
  }

  if (lastIndex < html.length) {
    const part = html.substring(lastIndex);
    sections.push({
      header: "",
      headerText: "",
      content: part,
      full: part,
    });
  }

  return sections;
}

/**
 * Performs a chunked diff by splitting input into sections and aligning them.
 */
export function chunkedExecute(
  oldHtml: string,
  newHtml: string,
  execute: (old: string, newVal: string) => string,
): string {
  let oldSections = splitBySections(oldHtml);
  let newSections = splitBySections(newHtml);

  // If no sections found (no headers), fall back to splitting by block-level elements
  let isBlockLevel = false;
  if (oldSections.length <= 1 && newSections.length <= 1) {
    oldSections = splitByBlocks(oldHtml);
    newSections = splitByBlocks(newHtml);
    isBlockLevel = true;
  }

  // Align by header text, or by exact block content if they are block chunks
  const matches = lcsAlignment(
    oldSections,
    newSections,
    (a, b) => {
      if (isBlockLevel) {
        return a.full === b.full;
      }
      return a.headerText !== "" && a.headerText === b.headerText;
    },
  );

  let result = "";
  let lastOld = 0;
  let lastNew = 0;

  for (const match of matches) {
    // 1. Handle deleted old sections
    for (let i = lastOld; i < match.oldIdx; i++) {
      result += `<del class="diffdel diff-block">${oldSections[i].full}</del>`;
    }

    // 2. Handle inserted new sections
    for (let j = lastNew; j < match.newIdx; j++) {
      result += `<ins class="diffins diff-block">${newSections[j].full}</ins>`;
    }

    // 3. Diff the matched section
    const o = oldSections[match.oldIdx];
    const n = newSections[match.newIdx];

    if (o.full === n.full) {
      result += n.full;
    } else {
      const diffContent = execute(o.content, n.content);
      result += n.header + diffContent;
    }

    lastOld = match.oldIdx + 1;
    lastNew = match.newIdx + 1;
  }

  // Handle remaining
  for (let i = lastOld; i < oldSections.length; i++) {
    result += `<del class="diffdel diff-block">${oldSections[i].full}</del>`;
  }
  for (let j = lastNew; j < newSections.length; j++) {
    result += `<ins class="diffins diff-block">${newSections[j].full}</ins>`;
  }

  return result;
}

export function replaceLineAttributesWithTokens(html: string): {
  html: string;
  tokens: Record<string, string>;
} {
  const tokens: Record<string, string> = {};
  // Regex to find data-line or data-line-end attributes
  const regex = /(\s?data-line(?:-end)?="[^"]*")/g;
  const result = html.replace(regex, (match) => {
    return createToken(match, "ATTR", tokens);
  });
  return { html: result, tokens };
}

/**
 * Orchestrates the initial structural diffing pipeline on a raw diff HTML string,
 * typically run BEFORE token restoration.
 */
export function applyPreRestorePipeline(html: string): string {
  let result = html;
  result = fixInvalidNesting(result);
  result = normalizeListContainerChanges(result);
  result = consolidateBlockDiffs(result);
  result = flattenDiffNesting(result);
  result = cleanupCheckboxArtifacts(result);
  return result;
}

/**
 * Orchestrates the full structural diffing pipeline on specialized or restored HTML.
 */
export function applyStructuralDiffPipeline(
  html: string,
  execute: (old: string, newVal: string) => string,
  allTokens: Record<string, string> = {},
): string {
  let result = html;
  result = balanceDiffTags(result);
  result = splitConsolidatedDiffs(result);

  const skipRefinementExecute = (
    old: string,
    newVal: string,
    options: { tokenizeListContainers?: boolean } = {},
  ) =>
    diffHtmlFragments(old, newVal, execute, {
      allTokens,
      skipRefinement: true,
      tokenizeListContainers: options.tokenizeListContainers,
    });

  result = refineBlockDiffs(result, skipRefinementExecute, allTokens);
  result = consolidateBlockDiffs(result);
  result = wrapHeadingPrefixes(result);
  result = extractSharedReparentedLists(result);
  result = markGhostListItems(result);
  result = consolidateWrappedItems(result);
  result = fixInvalidNesting(result);
  result = normalizeListContainerChanges(result);
  result = flattenDiffNesting(result);
  result = cleanupUnbalancedDiffTags(result);
  result = labelBlockDiffTags(result);
  return result;
}

/**
 * Final cleanup for unbalanced or redundant diff tags that might be
 * introduced during structural manipulation.
 */
export function balanceDiffTags(html: string): string {
  const stack: string[] = [];
  const tagRegex = /<(ins|del)\b[^>]*>|<\/(ins|del)>/gi;
  let m;
  let lastIndex = 0;
  let balanced = "";

  while ((m = tagRegex.exec(html)) !== null) {
    const fullTag = m[0];
    const tagName = (m[1] || m[2]).toLowerCase();
    const isClosing = fullTag.startsWith("</");

    if (isClosing) {
      if (stack.length > 0 && stack[stack.length - 1] === tagName) {
        stack.pop();
        balanced += html.substring(lastIndex, m.index + fullTag.length);
      } else {
        // Stray closing tag - ignore or just include the text before it
        balanced += html.substring(lastIndex, m.index);
      }
    } else {
      stack.push(tagName);
      balanced += html.substring(lastIndex, m.index + fullTag.length);
    }
    lastIndex = tagRegex.lastIndex;
  }
  balanced += html.substring(lastIndex);

  // Close any remaining open tags
  while (stack.length > 0) {
    const tag = stack.pop();
    balanced += `</${tag}>`;
  }

  return balanced;
}

export function cleanupUnbalancedDiffTags(html: string): string {
  let result = balanceDiffTags(html);

  // Fix cases like <section></del></ins> which happen if htmldiff gets confused by fragments
  result = result.replace(/<section>\s*<\/del>\s*<\/ins>/gi, "<section>");
  result = result.replace(/<section>\s*<\/ins>\s*<\/del>/gi, "<section>");

  // Fix inverted closing tags inside content
  result = result.replace(/<\/del>\s*<\/ins>/g, "</ins></del>");

  // Remove empty diff tags
  result = result.replace(/<(ins|del)[^>]*>\s*<\/\1>/gi, "");

  return result;
}

/**
 * Removes logically impossible nested diff tags (e.g., <del><ins>...</ins></del>).
 * htmldiff sometimes produces these when comparing complex block changes.
 * In split mode, the outer <del> hides the inner <ins> on the right pane,
 * causing content to disappear.
 */
export function flattenDiffNesting(html: string): string {
  let result = html;
  let changed = true;

  while (changed) {
    const prev = result;

    // Pattern: <outer><inner>CONTENT</inner></outer> where outer and inner are same or different types (del/ins)
    // We use negative lookaheads to ensure we don't match across sibling tags.
    result = result.replace(
      /<(del|ins)([^>]*)>((?:(?!<\/\1>)[\s\S])*?)<(ins|del)([^>]*)>([\s\S]*?)<\/\4>((?:(?!<\/\1>)[\s\S])*?)<\/\1>/gi,
      (match, t1, a1, s1, t2, a2, content, s2) => {
        if (t1.toLowerCase() === t2.toLowerCase()) {
          // Double wrapping of same type: consolidate them
          let mergedA = a2;
          if (a1.includes("diff-block") && !a2.includes("diff-block")) {
            if (mergedA.includes('class="')) {
              mergedA = mergedA.replace('class="', 'class="diff-block ');
            } else {
              mergedA += ' class="diff-block"';
            }
          }
          return s1 + `<${t1}${mergedA}>${content}</${t1}>` + s2;
        }

        // Opposite types: unwrap or split to ensure visibility in one of the panes
        if (!s1.trim() && !s2.trim()) {
          // Case 1: Purely wrapped. Unwrap outer and merge attributes (e.g. diff-block)
          let mergedA = a2;
          if (a1.includes("diff-block") && !a2.includes("diff-block")) {
            if (mergedA.includes('class="')) {
              mergedA = mergedA.replace('class="', 'class="diff-block ');
            } else {
              mergedA += ' class="diff-block"';
            }
          }
          return s1 + `<${t2}${mergedA}>${content}</${t2}>` + s2;
        } else {
          // Case 2: Mixed content. Split outer tag so inner remains visible.
          // <del>A <ins>B</ins> C</del> -> <del>A </del><ins>B</ins><del> C</del>
          const p1 = s1.trim() ? `<${t1}${a1}>${s1}</${t1}>` : s1;
          const p2 = s2.trim() ? `<${t1}${a1}>${s2}</${t1}>` : s2;
          return p1 + `<${t2}${a2}>${content}</${t2}>` + p2;
        }
      },
    );

    changed = result !== prev;
  }

  return result;
}

/**
 * Splits diff wrappers (ins/del) that contain multiple top-level blocks.
 * This ensures that refineBlockDiffs can match individual blocks correctly.
 */
export function splitConsolidatedDiffs(html: string): string {
  const blockTags = "h[1-6]|p|blockquote|pre|div|table|ul|ol|dl|section";
  const blocksRegex = new RegExp(
    `<(${blockTags})[^>]*>[\\s\\S]*?<\\/\\1>`,
    "gi",
  );

  let result = html;

  // First, look for pairs of <del> and <ins> that both contain multiple blocks
  // This is where interleaving is most effective.
  result = result.replace(
    /(<del([^>]*)>([\s\S]*?)<\/del>)\s*(<ins([^>]*)>([\s\S]*?)<\/ins>)/gi,
    (match, fullDel, delAttrs, delContent, fullIns, insAttrs, insContent) => {
      const delParts: string[] = [];
      const insParts: string[] = [];
      let m: RegExpExecArray | null;

      while ((m = blocksRegex.exec(delContent)) !== null) {
        delParts.push(m[0]);
      }
      blocksRegex.lastIndex = 0;
      while ((m = blocksRegex.exec(insContent)) !== null) {
        insParts.push(m[0]);
      }
      blocksRegex.lastIndex = 0;

      blocksRegex.lastIndex = 0;
      const delRemaining = delContent.replace(blocksRegex, "").trim();
      blocksRegex.lastIndex = 0;
      const insRemaining = insContent.replace(blocksRegex, "").trim();

      if (
        delParts.length > 1 &&
        insParts.length > 1 &&
        delParts.length === insParts.length &&
        delRemaining.length === 0 &&
        insRemaining.length === 0
      ) {
        return delParts
          .map((p, i) => {
            return `<del${delAttrs}>${p}</del><ins${insAttrs}>${insParts[i]}</ins>`;
          })
          .join("\n");
      }
      return match;
    },
  );

  // Fallback for single tags or unbalanced tags: split them normally
  const diffTags = ["ins", "del"];
  diffTags.forEach((tagName) => {
    const regex = new RegExp(
      `<${tagName}([^>]*)>([\\s\\S]*?)<\\/${tagName}>`,
      "gi",
    );

    result = result.replace(regex, (match, attrs, content) => {
      const parts: string[] = [];
      let m: RegExpExecArray | null;
      blocksRegex.lastIndex = 0;
      while ((m = blocksRegex.exec(content)) !== null) {
        parts.push(m[0]);
      }

      blocksRegex.lastIndex = 0;
      const remainingText = content.replace(blocksRegex, "").trim();

      if (parts.length > 1 && remainingText.length === 0) {
        return parts
          .map((p) => `<${tagName}${attrs}>${p}</${tagName}>`)
          .join("\n");
      }

      return match;
    });
  });

  return result;
}

export function consolidateWrappedItems(html: string): string {
  // Fix <p><ins>...</ins></p> -> <ins><p>...</p></ins>
  // Robust against whitespace and attributes
  // Note: We intentionally EXCLUDE <li> here because <ul><ins><li> is invalid HTML
  // and breaks sibling selectors like li + li. List items are handled via
  // markGhostListItems and data-all-inserted attributes instead.
  return html.replace(
    /<(h[1-6]|p|blockquote)([^>]*)>\s*<(ins|del)[^>]*>\s*([\s\S]*?)\s*<\/\3>\s*<\/\1>/gi,
    (match, tag, attrs, type, content) => {
      const diffClass = type === "ins" ? "diffins" : "diffdel";
      // Ensure we don't wrap twice
      if (match.includes("diff-block")) {
        return match;
      }
      return `<${type} class="${diffClass}"><${tag}${attrs}>${content}</${tag}></${type}>`;
    },
  );
}

/**
 * Masks attributes on block tags with a data-attr="MASKED" placeholder.
 */
/**
 * Masks attributes on block tags with a content-based hash placeholder.
 * This allows htmldiff to match blocks even if line numbers change,
 * while preserving the original attributes in a pool.
 */
export function maskBlockAttributes(
  html: string,
  providedToken?: string,
): {
  masked: string;
  attributes: string[];
  token: string;
  attributePools: Record<string, string[]>;
} {
  const attributePools: Record<string, string[]> = {};
  const blockTags =
    "h[1-6]|p|blockquote|pre|div|table|ul|ol|dl|section|li|tr|th|td|img";

  // Exclude already masked tags
  const regex = new RegExp(
    `(<(?:${blockTags}))(\\s+(?!data-attr-masked-)[^>]*?)(>)`,
    "gi",
  );

  const token =
    providedToken ||
    `data-attr-masked-${Math.random().toString(36).substring(2, 10)}`;

  const masked = html.replace(regex, (match, tag, attrs, close, _offset) => {
    // Normalize attributes for hashing by stripping volatile parts (data-line)
    const normalized = attrs.replace(/\s*data-line(-end)?="[^"]*"/g, "").trim();

    // Include the tag name, normalized attributes, and a small snippet of the
    // following content in the hash. This helps htmldiff align the correct blocks
    // and prevents attribute pool drift when blocks are reordered or inserted.
    const tagName = tag.substring(1).toLowerCase();

    const snippet = html
      .substring(_offset + match.length, _offset + match.length + 20)
      .replace(/\s+/g, " ");

    const hash = crypto
      .createHash("md5")
      .update(`${tagName}|${normalized}|${snippet}`)
      .digest("hex")
      .substring(0, 8);

    const key = `${token}x${hash}`;
    if (!attributePools[key]) {
      attributePools[key] = [];
    }
    attributePools[key].push(attrs.replace(/^\s+/, ""));

    return `${tag} ${key}="true"${close}`;
  });

  return { masked, attributes: [], token, attributePools };
}

/**
 * Restores the original attributes into the diff HTML using the attribute pools.
 */
export function restoreBlockAttributes(
  diffHtml: string,
  oldPools: Record<string, string[]>,
  newPools: Record<string, string[]>,
  token: string,
): string {
  // We need to keep track of how many times each hash has been used on each side
  const oldCounters: Record<string, number> = {};
  const newCounters: Record<string, number> = {};

  // Combined regex to track state and find tokens in one pass
  // Group 1: Opening ins/del tags
  // Group 2: Closing ins/del tags
  // Group 3: The attribute token itself
  // Group 4: The hash from the token (sub-group of 3)
  const combinedRegex = new RegExp(
    `(<(?:ins|del)\\b[^>]*>)|(<\\/(?:ins|del)>)|(${token}x([a-f0-9]{8})="true")`,
    "gi",
  );

  const tagStack: ("ins" | "del")[] = [];

  return diffHtml.replace(
    combinedRegex,
    (match, openTag, closeTag, tokenMatch, hash) => {
      if (openTag) {
        const lower = openTag.toLowerCase();
        if (lower.startsWith("<ins")) {
          tagStack.push("ins");
        } else if (lower.startsWith("<del")) {
          tagStack.push("del");
        }
        return match;
      }

      if (closeTag) {
        const lower = closeTag.toLowerCase();
        if (lower.startsWith("</ins")) {
          const idx = tagStack.lastIndexOf("ins");
          if (idx !== -1) {
            tagStack.splice(idx, 1);
          }
        } else if (lower.startsWith("</del")) {
          const idx = tagStack.lastIndexOf("del");
          if (idx !== -1) {
            tagStack.splice(idx, 1);
          }
        }
        return match;
      }

      if (tokenMatch) {
        const key = `${token}x${hash}`;
        let res;
        const inDel = tagStack.includes("del");
        const inIns = tagStack.includes("ins");
        
        const isOnlyInOld = oldPools[key] && (!newPools[key] || newPools[key].length === 0);
        const isOnlyInNew = newPools[key] && (!oldPools[key] || oldPools[key].length === 0);

        if (inDel || isOnlyInOld) {
          const idx = oldCounters[key] || 0;
          const pool = oldPools[key] || [];
          res = pool[idx] || pool[pool.length - 1] || "";
          oldCounters[key] = idx + 1;
        } else {
          // For shared or inserted, we prefer New attributes
          const idx = newCounters[key] || 0;
          const pool = newPools[key] || [];
          res = pool[idx] || pool[pool.length - 1] || "";
          newCounters[key] = idx + 1;

          // Also increment old counter if shared to keep them "aligned" where possible
          if (!inIns && !isOnlyInNew) {
            oldCounters[key] = (oldCounters[key] || 0) + 1;
          }
        }
        return res;
      }

      return match;
    },
  );
}

/**
 * Tokenization logic.
 */
export function replaceComplexBlocksWithTokens(
  html: string,
  options: {
    tokenizeListContainers?: boolean;
    tokenizeCodeBlocks?: boolean;
    tokenizeMarpSections?: boolean;
  } = {},
): {
  html: string;
  tokens: Record<string, string>;
} {
  const tokens: Record<string, string> = {};
  return replaceBalancedTags(html, tokens, {
    tokenizeListContainers: options.tokenizeListContainers,
    tokenizeCodeBlocks: options.tokenizeCodeBlocks ?? true,
    tokenizeMarpSections: options.tokenizeMarpSections ?? true,
  });
}

export function materializeCheckboxes(html: string): {
  html: string;
  tokens: Record<string, string>;
} {
  const tokens: Record<string, string> = {};
  const regex = /<input[^>]+class="task-list-item-checkbox"[^>]*>/gi;

  let index = 0;
  const result = html.replace(regex, (match) => {
    const isChecked = /\bchecked\b/i.test(match);
    const state = isChecked ? "CHECKED" : "UNCHECKED";

    // Use a hash of the content to ensure consistency, but also an index to distinguish
    // identical checkboxes on different lines.
    const hash = crypto
      .createHash("md5")
      .update(match)
      .digest("hex")
      .substring(0, 8);
    const token = `TKCB${index}H${hash}S${state}`;

    tokens[token] = match;
    index++;
    return token;
  });

  return { html: result, tokens };
}

export function replaceBalancedTags(
  html: string,
  tokens: Record<string, string>,
  options: {
    tokenizeListContainers?: boolean;
    tokenizeCodeBlocks?: boolean;
    tokenizeMarpSections?: boolean;
  } = {},
): { html: string; tokens: Record<string, string> } {
  let result = "";
  let i = 0;

  // Use sticky regex for list containers to avoid substring calls
  const listRegex = /^<(ol|ul|dl|table)(\s[^>]*)?>/iy;

  while (i < html.length) {
    if (html.startsWith('<div class="mermaid"', i)) {
      const start = i;
      const end = findClosing(html, i, "div");
      if (end > -1) {
        const content = html.substring(start, end);
        const token = createToken(content, "MERMAID", tokens);
        result += token;
        i = end;
        continue;
      }
    }
    if (html.startsWith('<div class="markdown-alert', i)) {
      const start = i;
      const end = findClosing(html, i, "div");
      if (end > -1) {
        const content = html.substring(start, end);
        const token = createToken(content, "ALERT", tokens);
        result += token;
        i = end;
        continue;
      }
    }

    if (options.tokenizeCodeBlocks !== false && html.startsWith('<div class="code-block-wrapper">', i)) {
      const start = i;
      const end = findClosing(html, i, "div");
      if (end > -1) {
        const content = html.substring(start, end);
        const token = createToken(content, "CODEBLOCK", tokens);
        result += token;
        i = end;
        continue;
      }
    }

    // Fallback: also tokenize bare <pre> elements (e.g. from Marp or other renderers
    // that do not use the code-block-wrapper div).
    if (options.tokenizeCodeBlocks !== false && html.startsWith("<pre", i)) {
      const start = i;
      const end = findClosing(html, i, "pre");
      if (end > -1) {
        const content = html.substring(start, end);
        const token = createToken(content, "CODEBLOCK", tokens);
        result += token;
        i = end;
        continue;
      }
    }

    if (html.startsWith("<hr", i)) {
      const start = i;
      const end = html.indexOf(">", i) + 1;
      if (end > 0) {
        const content = html.substring(start, end);
        const token = createToken(content, "HR", tokens);
        result += token;
        i = end;
        continue;
      }
    }

    // Math (KaTeX)
    const mathBlockMatch = html
      .substring(i)
      .match(/^<(p|div)\s[^>]*class=['"][^"']*\bkatex-(?:block|display)\b[^"']*['"][^>]*>/i);
    if (mathBlockMatch) {
      const start = i;
      const tagName = mathBlockMatch[1].toLowerCase();
      const end = findClosing(html, i, tagName);
      if (end > -1) {
        const content = html.substring(start, end);
        const token = createToken(content, "MATHBLOCK", tokens);
        result += token;
        i = end;
        continue;
      }
    }

    const mathInlineMatch = html
      .substring(i)
      .match(/^<span\s[^>]*class=['"][^"']*\bkatex\b[^"']*['"][^>]*>/i);
    if (mathInlineMatch) {
      const start = i;
      const end = findClosing(html, i, "span");
      if (end > -1) {
        const content = html.substring(start, end);
        const token = createToken(content, "MATH", tokens);
        result += token;
        i = end;
        continue;
      }
    }

    // Marp Sections (but not Footnotes section)
    if (
      options.tokenizeMarpSections !== false &&
      html.startsWith("<section", i) &&
      !html.startsWith('<section class="footnotes"', i)
    ) {
      const start = i;
      const end = findClosing(html, i, "section");
      if (end > -1) {
        const content = html.substring(start, end);
        const token = createToken(content, "SECTION", tokens);
        result += token;
        i = end;
        continue;
      }
    }

    // List and Table containers
    if (options.tokenizeListContainers !== false && html[i] === "<") {
      listRegex.lastIndex = i;
      const listMatch = listRegex.exec(html);
      if (listMatch) {
        const tagName = listMatch[1].toLowerCase();
        const start = i;
        const end = findClosing(html, i, tagName);
        if (end > -1) {
          const content = html.substring(start, end);
          const prefix =
            tagName === "table" ? "TABLE" : `LIST_${tagName.toUpperCase()}`;
          const token = createToken(content, prefix, tokens);
          result += token;
          i = end;
          continue;
        }
      }
    }

    // Tables (fallback when list/table container tokenization is disabled)
    if (options.tokenizeListContainers === false && html.startsWith("<table", i)) {
      const start = i;
      const end = findClosing(html, i, "table");
      if (end > -1) {
        const content = html.substring(start, end);
        const token = createToken(content, "TABLE", tokens);
        result += token;
        i = end;
        continue;
      }
    }

    result += html[i];
    i++;
  }

  return { html: result, tokens };
}


export function createToken(
  content: string,
  prefix: string,
  tokens: Record<string, string>,
): string {
  // Strip volatile data-line attributes from the hash content so that blocks
  // with identical content but different line numbers produce the same token.
  const hashContent = content.replace(/\s?data-line(?:-end)?="[^"]*"/g, "");

  const hash = crypto
    .createHash("sha256")
    .update(hashContent)
    .digest("hex")
    .substring(0, 12);
  const token = `TK${hash}${prefix}`;

  // Guard against re-tokenizing a token
  if (content === token) {
    return token;
  }

  tokens[token] = content;
  return token;
}

export function restoreComplexTokens(
  html: string,
  tokens: Record<string, string>,
): string {
  let restored = html;
  let hasMoreTokens = true;
  let iterations = 0;
  const MAX_ITERATIONS = 5;

  // Sort keys by length descending to replace longest/most-specific tokens first
  const keys = Object.keys(tokens).sort((a, b) => b.length - a.length);
  if (keys.length === 0) {
    return html;
  }

  // Create a mapping from uppercase key to original key for case-insensitive lookup
  const upperToOriginal = new Map<string, string>();
  for (const k of keys) {
    upperToOriginal.set(k.toUpperCase(), k);
  }

  // Create a single combined regex for all tokens
  const escapedKeys = keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const combinedRegex = new RegExp(escapedKeys.join("|"), "gi");

  while (hasMoreTokens && iterations < MAX_ITERATIONS) {
    hasMoreTokens = false;
    const prev = restored;

    // Use a single-pass replacement for all tokens
    restored = restored.replace(combinedRegex, (match) => {
      // Find the original token key (case-insensitive)
      const originalKey = upperToOriginal.get(match.toUpperCase());
      if (originalKey !== undefined) {
        const tokenValue = tokens[originalKey];
        if (tokenValue !== undefined) {
          hasMoreTokens = true;
          return tokenValue;
        }
      }
      return match;
    });

    if (restored === prev) {
      hasMoreTokens = false;
    }
    iterations++;
  }
  return restored;
}

/**
 * Refinement and Optimization logic.
 */
export function refineBlockDiffs(
  html: string,
  execute: (old: string, newVal: string) => string,
  _allTokens: Record<string, string> = {},
): string {
  const replacer = (
    match: string,
    delBlock: string,
    oldHtml: string,
    insBlock: string,
    newHtml: string,
  ) => {
    const alertCount = (newHtml.match(/class="markdown-alert/g) || []).length;
    if (alertCount > 1) {
      return match;
    }

    const footnoteItemRegex =
      /<li[^>]*class=["']footnote-item["'][^>]*>[\s\S]*?<\/li>/gi;
    const oldFootnotes = oldHtml.match(footnoteItemRegex) || [];
    const newFootnotes = newHtml.match(footnoteItemRegex) || [];

    if (
      oldFootnotes.length !== newFootnotes.length ||
      oldFootnotes.length > 1
    ) {
      let result = "";
      const max = Math.max(oldFootnotes.length, newFootnotes.length);
      for (let i = 0; i < max; i++) {
        const oldItem = oldFootnotes[i];
        const newItem = newFootnotes[i];
        if (oldItem && newItem) {
          result += execute(oldItem, newItem);
        } else if (oldItem) {
          result += `<del class="diffdel">${oldItem}</del>`;
        } else if (newItem) {
          result += `<ins class="diffins">${newItem}</ins>`;
        }
      }
      return result;
    }

    return execute(oldHtml, newHtml);
  };

  let resultHtml = html;

  const alertRegex =
    /(<del[^>]*>\s*(<div class="markdown-alert[^>]*>[\s\S]*?<\/div>)\s*<\/del>)\s*(<ins[^>]*>\s*(<div class="markdown-alert[^>]*>[\s\S]*?<\/div>)\s*<\/ins>)/gi;

  resultHtml = resultHtml.replace(
    alertRegex,
    (match, delBlock, oldInner, insBlock, newInner) => {
      const openTagRegex = /^<div class="markdown-alert[^>]*>/;
      const oldOpenMatch = oldInner.match(openTagRegex);
      const newOpenMatch = newInner.match(openTagRegex);

      if (
        oldOpenMatch &&
        newOpenMatch &&
        oldInner.endsWith("</div>") &&
        newInner.endsWith("</div>")
      ) {
        const oldOpen = oldOpenMatch[0];
        const newOpen = newOpenMatch[0];
        const oldContent = oldInner.substring(oldOpen.length, oldInner.length - 6).trim();
        const newContent = newInner.substring(newOpen.length, newInner.length - 6).trim();

        const titleRegex = /<p class="markdown-alert-title">([\s\S]*?)<\/p>/;
        const oldTitleMatch = oldContent.match(titleRegex);
        const newTitleMatch = newContent.match(titleRegex);

        if (
          oldTitleMatch &&
          newTitleMatch &&
          oldTitleMatch[0] === newTitleMatch[0]
        ) {
          const titleHtml = oldTitleMatch[0];
          const oldBody = oldContent.replace(titleHtml, "").trim();
          const newBody = newContent.replace(titleHtml, "").trim();
          const diffBody = execute(oldBody, newBody);
          return `${newOpen}${titleHtml}\n${diffBody}</div>`;
        }
      }

      return replacer(match, delBlock, oldInner, insBlock, newInner);
    },
  );

  const listContainerRegex =
    /<del[^>]*>\s*<(ol|ul|dl)([^>]*)>([\s\S]*?)<\/\1>\s*<\/del>\s*<ins[^>]*>\s*<(ol|ul|dl)([^>]*)>([\s\S]*?)<\/\4>\s*<\/ins>/gi;

  resultHtml = resultHtml.replace(
    listContainerRegex,
    (match, oldTag, oldAttrs, oldContent, newTag, newAttrs, newContent) => {
      if (oldTag.toLowerCase() !== newTag.toLowerCase()) {
        return createStructuralListContainerDiff(
          oldTag,
          oldAttrs,
          oldContent,
          newTag,
          newAttrs,
          newContent,
        );
      }

      return (execute as any)(
        `<${oldTag}${oldAttrs}>${oldContent}</${oldTag}>`,
        `<${newTag}${newAttrs}>${newContent}</${newTag}>`,
        { tokenizeListContainers: false },
      );
    },
  );

  const footnoteBundleRegex =
    /<del[^>]*>\s*((?:<li[^>]*>[\s\S]*?<\/li>\s*)+)<\/del>\s*<ins[^>]*>\s*((?:<li[^>]*>[\s\S]*?<\/li>\s*)+)<\/ins>/gi;
  const footnoteItemRegex = /<li[^>]*>[\s\S]*?<\/li>/gi;
  const getFootnoteId = (itemHtml: string) => {
    const id = itemHtml.match(/\bid=["']([^"']+)["']/i)?.[1] ?? null;
    return id ? id.replace(/-(old|new)-/, "-") : id;
  };

  resultHtml = resultHtml.replace(
    footnoteBundleRegex,
    (match, oldBundle, newBundle) => {
      const oldFootnotes = oldBundle.match(footnoteItemRegex) || [];
      const newFootnotes = newBundle.match(footnoteItemRegex) || [];

      if (oldFootnotes.length === 0 || newFootnotes.length === 0) {
        return match;
      }

      const usedOldFootnotes = new Set<number>();
      const usedNewFootnotes = new Set<number>();
      const matches = new Map<number, number>();

      const stripFootnote = (html: string) =>
        html
          .replace(/<a\b[^>]*class="footnote-backref"[\s\S]*?<\/a>/gi, "")
          .replace(/<[^>]+>/g, "")
          .trim();

      // Pass 1: Exact content match (ignoring backref)
      oldFootnotes.forEach((oldF: string, oldIdx: number) => {
        const oldBody = stripFootnote(oldF);
        if (!oldBody) {
          return;
        }
        const matchedIdx = newFootnotes.findIndex(
          (newF: string, newIdx: number) =>
            !usedNewFootnotes.has(newIdx) && stripFootnote(newF) === oldBody,
        );
        if (matchedIdx !== -1) {
          usedOldFootnotes.add(oldIdx);
          usedNewFootnotes.add(matchedIdx);
          matches.set(oldIdx, matchedIdx);
        }
      });

      // Pass 2: ID match for remaining
      oldFootnotes.forEach((oldF: string, oldIdx: number) => {
        if (usedOldFootnotes.has(oldIdx)) {
          return;
        }
        const oldId = getFootnoteId(oldF);
        if (oldId) {
          const matchedIdx = newFootnotes.findIndex(
            (newF: string, newIdx: number) =>
              !usedNewFootnotes.has(newIdx) && getFootnoteId(newF) === oldId,
          );
          if (matchedIdx !== -1) {
            usedOldFootnotes.add(oldIdx);
            usedNewFootnotes.add(matchedIdx);
            matches.set(oldIdx, matchedIdx);
          }
        }
      });

      // Pass 3: Index match if lengths are same
      if (oldFootnotes.length === newFootnotes.length) {
        oldFootnotes.forEach((_: string, oldIdx: number) => {
          if (!usedOldFootnotes.has(oldIdx)) {
            const matchedIdx = newFootnotes.findIndex(
              (_: string, newIdx: number) => !usedNewFootnotes.has(newIdx),
            );
            if (matchedIdx !== -1) {
              usedOldFootnotes.add(oldIdx);
              usedNewFootnotes.add(matchedIdx);
              matches.set(oldIdx, matchedIdx);
            }
          }
        });
      }

      let res = "";
      oldFootnotes.forEach((oldF: string, oldIdx: number) => {
        const newIdx = matches.get(oldIdx);
        if (newIdx !== undefined) {
          res += execute(oldF, newFootnotes[newIdx]);
        } else {
          res += `<del class="diffdel">${oldF}</del>`;
        }
      });

      newFootnotes.forEach((newFootnote: string, index: number) => {
        if (!usedNewFootnotes.has(index)) {
          res += `<ins class="diffins">${newFootnote}</ins>`;
        }
      });

      return res;
    },
  );

  const headingRegex =
    /<(del|ins)[^>]*>\s*<(h[1-6])([^>]*)>([\s\S]*?)<\/\2>\s*<\/\1>\s*<(ins|del)[^>]*>\s*<(h[1-6])([^>]*)>([\s\S]*?)<\/\6>\s*<\/\5>/gi;

  resultHtml = resultHtml.replace(
    headingRegex,
    (match, outer1, tag1, attrs1, content1, outer2, tag2, attrs2, content2) => {
      if (tag1.toLowerCase() !== tag2.toLowerCase()) {
        return match;
      }
      if (outer1.toLowerCase() === outer2.toLowerCase()) {
        return match;
      }
      // Re-run the diff on the inner content to restore granularity
      const oldInner = outer1.toLowerCase() === "del" ? content1 : content2;
      const newInner = outer1.toLowerCase() === "ins" ? content1 : content2;
      const newTag = outer1.toLowerCase() === "ins" ? tag1 : tag2;
      const newAttrs = outer1.toLowerCase() === "ins" ? attrs1 : attrs2;

      const innerDiff = execute(oldInner, newInner);
      return `<${newTag}${newAttrs}>${innerDiff}</${newTag}>`;
    },
  );

  // NOTE: We must pass tokenizeCodeBlocks: false here.
  // The execute function (skipRefinementExecute) calls diffHtmlFragments → executeWithFullPipeline,
  // which by default re-tokenizes <pre> blocks as opaque tokens. That would cause htmldiff to see
  // two different opaque tokens and produce no granular diff inside the code block.
  // By disabling code block tokenization for this inner call, the <pre> content is diffed directly.
  const diffCodeBlocks = (oldCode: string, newCode: string) =>
    diffHtmlFragments(oldCode, newCode, execute, {
      allTokens: _allTokens,
      skipRefinement: true,
      tokenizeCodeBlocks: false,
    });

  // NOTE: We cannot use a simple adjacency regex (del<pre></pre>del ins<pre></pre>ins) because
  // other diff elements (e.g. a deleted section) may sit between the del-pre and ins-pre blocks.
  // Instead, collect all del-wrapped and ins-wrapped code blocks globally, pair them by index,
  // re-diff each pair, and substitute back via placeholder tokens.
  //
  // Code blocks may appear as:
  //   A) <del><div class="code-block-wrapper"><pre ...>...</pre></div></del>  (standard renderer)
  //   B) <del><pre ...>...</pre></del>                                        (bare, e.g. Marp)
  {
    interface PreBlock {
      full: string;
      wrapperAttrs: string; // div attrs (empty string for bare <pre>)
      preAttrs: string;
      inner: string;
      isWrapped: boolean;   // true → code-block-wrapper present
    }
    const delWrappedBlocks: PreBlock[] = [];
    const insWrappedBlocks: PreBlock[] = [];
    const delBareBlocks: PreBlock[] = [];
    const insBareBlocks: PreBlock[] = [];

    // Pattern A: del/ins wrapping the code-block-wrapper div
    const delWrappedRegex =
      /<del([^>]*)>\s*<div class="code-block-wrapper"([^>]*)>\s*<pre([^>]*)>([\s\S]*?)<\/pre>\s*<\/div>\s*<\/del>/gi;
    const insWrappedRegex =
      /<ins([^>]*)>\s*<div class="code-block-wrapper"([^>]*)>\s*<pre([^>]*)>([\s\S]*?)<\/pre>\s*<\/div>\s*<\/ins>/gi;

    let m: RegExpExecArray | null;
    while ((m = delWrappedRegex.exec(resultHtml)) !== null) {
      delWrappedBlocks.push({ full: m[0], wrapperAttrs: m[2], preAttrs: m[3], inner: m[4], isWrapped: true });
    }
    while ((m = insWrappedRegex.exec(resultHtml)) !== null) {
      insWrappedBlocks.push({ full: m[0], wrapperAttrs: m[2], preAttrs: m[3], inner: m[4], isWrapped: true });
    }

    // Pattern B: del/ins wrapping a bare <pre> (fallback for Marp etc.)
    const delPreRegex =
      /<del([^>]*)>\s*<pre([^>]*)>([\s\S]*?)<\/pre>\s*<\/del>/gi;
    const insPreRegex =
      /<ins([^>]*)>\s*<pre([^>]*)>([\s\S]*?)<\/pre>\s*<\/ins>/gi;

    while ((m = delPreRegex.exec(resultHtml)) !== null) {
      delBareBlocks.push({ full: m[0], wrapperAttrs: "", preAttrs: m[2], inner: m[3], isWrapped: false });
    }
    while ((m = insPreRegex.exec(resultHtml)) !== null) {
      insBareBlocks.push({ full: m[0], wrapperAttrs: "", preAttrs: m[2], inner: m[3], isWrapped: false });
    }

    const diffedPairs: Array<{
      delFull: string;
      insFull: string;
      diffed: string;
    }> = [];

    const pairWrappedCount = Math.min(delWrappedBlocks.length, insWrappedBlocks.length);
    for (let i = 0; i < pairWrappedCount; i++) {
      const innerDiff = diffCodeBlocks(
        delWrappedBlocks[i].inner,
        insWrappedBlocks[i].inner,
      );
      const diffedPre = `<pre${insWrappedBlocks[i].preAttrs}>${innerDiff}</pre>`;
      const diffed = `<div class="code-block-wrapper"${insWrappedBlocks[i].wrapperAttrs}>${diffedPre}</div>`;
      diffedPairs.push({
        delFull: delWrappedBlocks[i].full,
        insFull: insWrappedBlocks[i].full,
        diffed,
      });
    }

    const pairBareCount = Math.min(delBareBlocks.length, insBareBlocks.length);
    for (let i = 0; i < pairBareCount; i++) {
      const innerDiff = diffCodeBlocks(
        delBareBlocks[i].inner,
        insBareBlocks[i].inner,
      );
      const diffedPre = `<pre${insBareBlocks[i].preAttrs}>${innerDiff}</pre>`;
      diffedPairs.push({
        delFull: delBareBlocks[i].full,
        insFull: insBareBlocks[i].full,
        diffed: diffedPre,
      });
    }

    const pairCount = diffedPairs.length;
    if (pairCount > 0) {

      const uniqueRunId = Math.random().toString(36).slice(2, 10);
      for (let i = 0; i < diffedPairs.length; i++) {
        const placeholder = `PREDIFF_${i}_${uniqueRunId}_PLACEHOLDER`;
        resultHtml = resultHtml.replace(
          diffedPairs[i].delFull,
          () => placeholder,
        );
        resultHtml = resultHtml.replace(diffedPairs[i].insFull, () => "");
        diffedPairs[i].delFull = placeholder;
      }
      for (let i = 0; i < diffedPairs.length; i++) {
        resultHtml = resultHtml.replace(
          diffedPairs[i].delFull,
          () => diffedPairs[i].diffed,
        );
      }
    }
  }

  const blockquoteRegex =
    /(<del[^>]*>\s*(<blockquote>[\s\S]*?<\/blockquote>)\s*<\/del>)\s*(<ins[^>]*>\s*(<blockquote>[\s\S]*?<\/blockquote>)\s*<\/ins>)/gi;

  resultHtml = resultHtml.replace(
    blockquoteRegex,
    (match, delWrapper, delInner, insWrapper, insInner) => {
      const cleanedInnerDiff = execute(delInner, insInner);
      return cleanedInnerDiff;
    },
  );

  const genericBlockRegex =
    /(<del[^>]*>\s*<([a-z1-6]+)(?:\s+[^>]*)?>([\s\S]*?)<\/\2>\s*<\/del>)\s*(<ins[^>]*>\s*<([a-z1-6]+)(?:\s+[^>]*)?>([\s\S]*?)<\/\5>\s*<\/ins>)/gi;

  resultHtml = resultHtml.replace(
    genericBlockRegex,
    (match, delWrapper, delTag, delInner, insWrapper, insTag, insInner) => {
      if (delTag.toLowerCase() !== insTag.toLowerCase()) {
        return match;
      }

      // Special handling for pre blocks to ensure we don't break syntax highlighting
      // if it's already highlighted.
      if (delTag.toLowerCase() === "pre") {
        return match;
      }

      // Attempt to extract attributes from the new tag to preserve classes/line numbers
      const attributesMatch = match.match(
        /<ins[^>]*>\s*<[a-z1-6]+(\s+[^>]*)?>/i,
      );
      const attributes =
        attributesMatch && attributesMatch[1] ? attributesMatch[1] : "";

      // EXCEPTION: Do not re-diff the inside of specialized blocks like Mermaid or GitHub Alerts.
      // For Mermaid: Re-diffing injects <ins>/<del> tags that break their specific parsers.
      // For Alerts: It often causes redundant nesting (double vertical bars).
      if (
        /class=["'][^"']*(?:mermaid|markdown-alert|katex)[^"']*["']/i.test(
          attributes,
        )
      ) {
        if (/class=["'][^"']*mermaid[^"']*["']/i.test(attributes)) {
          const unescapeHtml = (str: string) =>
            str
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .replace(/&amp;/g, "&");

          const oldCode = unescapeHtml(delInner.replace(/<[^>]+>/g, "").trim());
          const newCode = unescapeHtml(insInner.replace(/<[^>]+>/g, "").trim());
          const diffMermaid = computeMermaidDiff(oldCode, newCode);
          const escapedDiff = escapeHtml(diffMermaid);
          return `<${insTag}${attributes}>${escapedDiff}</${insTag}>`;
        }
        return match;
      }

      // Re-run the diff on the inner content to restore granularity
      const innerDiff = execute(delInner, insInner);

      // Clean up potential invalid nesting introduced by htmldiff in fragments
      const cleanedInnerDiff = fixInvalidNesting(innerDiff);

      return `<${insTag}${attributes}>${cleanedInnerDiff}</${insTag}>`;
    },
  );

  const boldToHeadingRe =
    /<p[^>]*>\s*<strong[^>]*>\s*<del[^>]*>([\s\S]*?)<\/del>\s*(?:<\/strong>)?\s*<\/p>\s*<ins[^>]*>\s*<(h[1-6])([^>]*)>([\s\S]*?)<\/\2>\s*<\/ins>/gi;

  resultHtml = resultHtml.replace(
    boldToHeadingRe,
    (match, delInner, newTag, newAttrs, insInner) => {
      const delText = delInner.replace(/<[^>]+>/g, "").trim();
      const insText = insInner.replace(/<[^>]+>/g, "").trim();
      if (delText !== insText) {
        return match;
      }
      return `<${newTag}${newAttrs}>${insInner}</${newTag}>`;
    },
  );

  const headingToBoldRe =
    /<del[^>]*>\s*<(h[1-6])([^>]*)>([\s\S]*?)<\/\1>\s*<\/del>\s*<p[^>]*>\s*<strong[^>]*>\s*<ins[^>]*>([\s\S]*?)<\/ins>\s*(?:<\/strong>)?\s*<\/p>/gi;

  resultHtml = resultHtml.replace(
    headingToBoldRe,
    (match, _oldTag, _oldAttrs, delInner, insInner) => {
      const delText = delInner.replace(/<[^>]+>/g, "").trim();
      const insText = insInner.replace(/<[^>]+>/g, "").trim();
      if (delText !== insText) {
        return match;
      }
      return `<p><strong>${insInner}</strong></p>`;
    },
  );

  const tableRegex =
    /(<del[^>]*>\s*(<table[^>]*>[\s\S]*?<\/table>)\s*<\/del>)\s*(<ins[^>]*>\s*(<table[^>]*>[\s\S]*?<\/table>)\s*<\/ins>)/gi;

  resultHtml = resultHtml.replace(
    tableRegex,
    (match, delBlock, oldInner, insBlock, newInner) => {
      return diffTables(oldInner, newInner, execute);
    },
  );

  const imageRegex =
    /(?:<p([^>]*)>\s*)?(<del[^>]*>\s*(<img[^>]*>)\s*<\/del>)\s*(<ins[^>]*>\s*(<img[^>]*>)\s*<\/ins>)(?:\s*<\/p>)?/gi;

  resultHtml = resultHtml.replace(
    imageRegex,
    (match, pAttrs, delBlock, oldImg, insBlock, newImg) => {
      // Extract line number from the new image if possible (more reliable than wrapping <p>)
      const newImgLineMatch = newImg.match(/data-line="([^"]*)"/i);
      const attrs = newImgLineMatch ? ` data-line="${newImgLineMatch[1]}"` : (pAttrs || "");

      // Wrap the changed image pair in a consolidated container
      // Note: We intentionally discard the wrapping <p> if it was matched to prevent <div> inside <p>
      // BUT we preserve its attributes (like data-line) for mapping.
      return `<div class="image-diff-block" data-image-diff="true"${attrs}>
        <div class="image-diff-wrapper">
          <div class="diff-image-old">${oldImg}</div>
          <div class="diff-image-new">${newImg}</div>
        </div>
      </div>`;
    },
  );

  return resultHtml;
}

export function consolidateBlockDiffs(html: string): string {
  const blocks = [
    "table",
    "ul",
    "ol",
    "dl",
    "blockquote",
    "div",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "section",
    "svg",
    "pre",
    "hr",
  ];
  let result = html;
  const blockTags =
    "table|ul|ol|dl|blockquote|div|h1|h2|h3|h4|h5|h6|section|svg|pre";
  const selfClosingTags = "hr";
  const blockElementPattern = `(?:<(?:${blockTags})[^>]*>[\\s\\S]*?<\\/(?:${blockTags})>|<(?:${selfClosingTags})[^>]*\\/?>)`;

  const fullWrapRegex = new RegExp(
    `(<(ins|del)[^>]*>)\\s*(${blockElementPattern}(?:\\s*${blockElementPattern})*)\\s*(<\\/\\2>)`,
    "gi",
  );

  result = result.replace(
    fullWrapRegex,
    (match, openTag, type, content, closeTag) => {
      if (match.includes('class="diff-block"')) {
        return match;
      }
      const tagWithClass = openTag.includes("class=")
        ? openTag.replace(/class="([^"]*)"/i, 'class="$1 diff-block"')
        : openTag.replace(/>$/, ' class="diff-block">');

      return `${tagWithClass}${content}${closeTag}`;
    },
  );
  blocks.forEach((tag) => {
    const regex = new RegExp(
      `<(?:${tag})[^>]*>[\\s\\S]*?<\\/(?:${tag})>|<(?:${tag})[^>]*\\/?>`,
      "gi",
    );
    result = result.replace(regex, (match, offset) => {
      // EXCEPTION: Don't consolidate math blocks or Marp sections into block-level diffs.
      // This keeps the diff tags internal and prevents layout breakage.
      if (
        match.includes("TOKEN_MATH") ||
        match.startsWith("<section") ||
        match.startsWith("<pre")
      ) {
        return match;
      }

      const hasIns = /<ins\b[^>]*>([\s\S]*?)<\/ins>/gi.test(match);
      const hasDel = /<del\b[^>]*>([\s\S]*?)<\/del>/gi.test(match);

      if (hasIns && !hasDel) {
        if (checkIfAllContentIsWrapped(match, "ins")) {
          // If the block is ALREADY wrapped in an outer diff tag, don't wrap it again.
          const before = result.substring(0, offset);
          if (
            /<(ins|del)\b[^>]*class="[^"]*diff-block[^"]*"[^>]*>[\s\n]*$/i.test(
              before,
            )
          ) {
            return match;
          }
          return `<ins class="diffins diff-block">${cleanInnerDiffTags(match, "ins")}</ins>`;
        }
      } else if (hasDel && !hasIns) {
        if (checkIfAllContentIsWrapped(match, "del")) {
          const before = result.substring(0, offset);
          if (
            /<(ins|del)\b[^>]*class="[^"]*diff-block[^"]*"[^>]*>[\s\n]*$/i.test(
              before,
            )
          ) {
            return match;
          }
          return `<del class="diffdel diff-block">${cleanInnerDiffTags(match, "del")}</del>`;
        }
      }
      return match;
    });
  });

  // Final cleanup: Deduplicate diff-block class if any doubling occurred
  result = result.replace(/class="([^"]*)"/g, (m, c) => {
    if (c.includes("diff-block diff-block")) {
      return `class="${c.replace(/\bdiff-block\s+diff-block\b/g, "diff-block")}"`;
    }
    return m;
  });

  // Specifically consolidate math blocks into diff-blocks to ensure full-width and labels
  result = result.replace(
    /<(ins|del)([^>]*)>\s*<(p|div)([^>]*class="[^"]*katex-block[^"]*"[^>]*)>([\s\S]*?)<\/\3>\s*<\/\1>/gi,
    (match, type, insAttrs, tag, tagAttrs, content) => {
      const diffClass = type === "ins" ? "diffins" : "diffdel";
      // Avoid double-wrapping if diff-block is already present
      if (insAttrs.includes("diff-block")) {
        return match;
      }
      // Strip existing class from insAttrs to avoid duplicates
      const cleanAttrs = insAttrs.replace(/\s*class=["'][^"']*["']/g, "");
      return `<${type} class="${diffClass} diff-block"${cleanAttrs}><${tag}${tagAttrs}>${content}</${tag}></${type}>`;
    },
  );

  return result;
}

function ensureDiffBlockClass(
  attrs: string,
  defaultDiffClass: "diffins" | "diffdel",
): string {
  const classAttrRegex = /\bclass=(["'])([^"']*)\1/i;
  const classMatch = attrs.match(classAttrRegex);
  if (!classMatch) {
    return `${attrs} class="${defaultDiffClass} diff-block"`;
  }

  if (/\bdiff-block\b/.test(classMatch[2])) {
    return attrs;
  }

  const updatedClasses = `${classMatch[2]} diff-block`.trim();
  return attrs.replace(
    classAttrRegex,
    `class=${classMatch[1]}${updatedClasses}${classMatch[1]}`,
  );
}

export function normalizeMathBlockDiffs(html: string): string {
  const normalizeWrappedMathBlocks = (
    source: string,
    tag: "ins" | "del",
    defaultDiffClass: "diffins" | "diffdel",
  ) =>
    source.replace(
      new RegExp(
        `<${tag}([^>]*)>\\s*(<p[^>]*class=(["'])[^"']*katex-block[^"']*\\2[^>]*>[\\s\\S]*?<\\/p>)\\s*<\\/${tag}>`,
        "gi",
      ),
      (_match, attrs: string, block: string) =>
        `<${tag}${ensureDiffBlockClass(attrs, defaultDiffClass)}>${cleanInnerDiffTags(block, tag)}</${tag}>`,
    );

  const normalizedWrappedBlocks = normalizeWrappedMathBlocks(
    normalizeWrappedMathBlocks(html, "ins", "diffins"),
    "del",
    "diffdel",
  );

  return normalizedWrappedBlocks.replace(
    /<p[^>]*class=("|')[^"']*katex-block[^"']*\1[^>]*>[\s\S]*?<\/p>/gi,
    (match) => {
      const hasIns = /<ins\b[^>]*>([\s\S]*?)<\/ins>/gi.test(match);
      const hasDel = /<del\b[^>]*>([\s\S]*?)<\/del>/gi.test(match);

      if (hasIns && !hasDel && checkIfAllContentIsWrapped(match, "ins")) {
        return `<ins class="diffins diff-block">${cleanInnerDiffTags(match, "ins")}</ins>`;
      }

      if (hasDel && !hasIns && checkIfAllContentIsWrapped(match, "del")) {
        return `<del class="diffdel diff-block">${cleanInnerDiffTags(match, "del")}</del>`;
      }

      return match;
    },
  );
}

export function cleanupCheckboxArtifacts(html: string): string {
  let result = html.replace(
    /(<input[^>]+class="task-list-item-checkbox"[^>]*>)(\s*)(?=(?:<p\b|<div\b|<del[^>]*>\s*\[))/gi,
    '<del class="diffdel">$1</del>$2',
  );
  result = result.replace(
    /(<input[^>]+class="task-list-item-checkbox"[^>]*>)(\s*)(?=(?:<p\b|<div\b|<ins[^>]*>\s*\[))/gi,
    '<ins class="diffins">$1</ins>$2',
  );
  return result;
}

export function stripDataLineAttributes(html: string): string {
  return html.replace(/ data-line(?:-end)?="\d+"/g, "");
}

export function wrapHeadingPrefixes(html: string): string {
  return html.replace(
    /(<h[1-6][^>]*>)((?:\s*(?:<(?:del|ins)[^>]*>)?\s*[\d\.\[\]]+\s*(?:<\/(?:del|ins)>)?\s*)+(?:\]\s*)?(?=\S))/gi,
    (match, tag, prefix) => {
      if (!/<(ins|del)\b/.test(prefix)) {
        return match;
      }
      const openIns = (prefix.match(/<ins\b/g) || []).length;
      const closeIns = (prefix.match(/<\/ins>/g) || []).length;
      const openDel = (prefix.match(/<del\b/g) || []).length;
      const closeDel = (prefix.match(/<\/del>/g) || []).length;
      if (openIns !== closeIns || openDel !== closeDel) {
        return match;
      }
      return tag + '<span class="heading-prefix">' + prefix + "</span>";
    },
  );
}

export function markGhostListItems(html: string): string {
  // 1. First, handle cases where the whole list container is wrapped in <ins> or <del>
  let result = html.replace(
    /(<(ins|del)[^>]*>)\s*(<(ul|ol|dl)[^>]*>[\s\S]*?<\/(ul|ol|dl)>)\s*(<\/\2>)/gi,
    (match, open, type, list, openTagName, closeTagName, close) => {
      if (openTagName.toLowerCase() !== closeTagName.toLowerCase()) {
        return match;
      }

      const marker =
        type === "ins"
          ? ' data-all-inserted="true"'
          : ' data-all-deleted="true"';

      const markedList = list.replace(
        /<li([^>]*)>/gi,
        (liMatch: string, attrs: string) => {
          if (
            attrs.includes('data-all-inserted="true"') ||
            attrs.includes('data-all-deleted="true"')
          ) {
            return liMatch;
          }

          return `<li${attrs}${marker}>`;
        },
      );

      return `${open}${markedList}${close}`;
    },
  );

  // 2. Then handle cases where the whole <li> is wrapped in <ins> or <del>
  result = result.replace(
    /(<(ins|del)[^>]*>)\s*(<li[^>]*>[\s\S]*?<\/li>)\s*(<\/\2>)/gi,
    (match, open, type, li, close) => {
      if (type === "ins") {
        return (
          open + li.replace(/^<li/, '<li data-all-inserted="true"') + close
        );
      } else {
        return open + li.replace(/^<li/, '<li data-all-deleted="true"') + close;
      }
    },
  );

  // 3. Then handle cases where the markers are INSIDE the <li>
  result = result.replace(
    /<li([^>]*)>([\s\S]*?)<\/li>/gi,
    (match, attrs: string, content: string) => {
      if (
        attrs.includes('data-all-inserted="true"') ||
        attrs.includes('data-all-deleted="true"')
      ) {
        return match;
      }
      if (/<li\b/i.test(content)) {
        return match;
      }
      const stripInsignificant = (s: string) =>
        s
          .replace(
            /<\/?(strong|em|b|i|concept|code|s|span|a|p|div|br|section)\b[^>]*>/gi,
            "",
          )
          .replace(/[.\s]+/g, "")
          .replace(/\u21a9[\ufe0e\ufe0f]?/g, "") // Strip backref emoji variants (↩︎)
          .trim();

      const withoutIns = content.replace(/<ins\b[^>]*>[\s\S]*?<\/ins>/gi, "");
      const withoutDel = content.replace(/<del\b[^>]*>[\s\S]*?<\/del>/gi, "");
      let newAttrs = attrs;

      if (stripInsignificant(withoutIns) === "") {
        newAttrs += ' data-all-inserted="true"';
      }
      if (stripInsignificant(withoutDel) === "") {
        newAttrs += ' data-all-deleted="true"';
      }
      if (newAttrs === attrs) {
        return match;
      }
      return `<li${newAttrs}>${content}</li>`;
    },
  );
  return result;
}

export function extractSharedReparentedLists(html: string): string {
  const normalizeListFragment = (fragment: string) =>
    fragment
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

  const findMatchingDeletedNestedListWrapper = (
    sourceHtml: string,
    beforeIndex: number,
    normalizedSharedList: string,
  ): { wrapper: string; index: number } | null => {
    const prefix = sourceHtml.slice(0, beforeIndex);
    const deletedNestedListRegex =
      /(?:<del[^>]*>\s*<\/del>\s*)?<del[^>]*class="[^"]*diff-block[^"]*"[^>]*>\s*(<(ul|ol|dl)[^>]*>[\s\S]*?<\/\2>)\s*<\/del>(?:\s*<del[^>]*>\s*<\/del>\s*)*/gi;
    let deletedMatch: RegExpExecArray | null;
    let matchedDeletedWrapper: { wrapper: string; index: number } | null = null;
    while ((deletedMatch = deletedNestedListRegex.exec(prefix)) !== null) {
      const deletedList = deletedMatch[1];
      if (normalizeListFragment(deletedList) === normalizedSharedList) {
        matchedDeletedWrapper = {
          wrapper: deletedMatch[0],
          index: deletedMatch.index,
        };
      }
    }
    return matchedDeletedWrapper;
  };

  const insertedCompositeRegex =
    /<ins([^>]*)>\s*(<(ol|ul|dl)[^>]*>\s*<li[\s\S]*?<\/li>\s*<\/\3>)\s*(<(ul|ol|dl)[^>]*>[\s\S]*?<\/\5>)\s*<\/ins>(?:\s*<ins[^>]*>\s*<\/ins>\s*)*/gi;

  let result = html;
  const matches: {
    index: number;
    fullMatch: string;
    insertedAttrs: string;
    newParentList: string;
    sharedList: string;
  }[] = [];
  let compositeMatch: RegExpExecArray | null;
  insertedCompositeRegex.lastIndex = 0;
  while ((compositeMatch = insertedCompositeRegex.exec(result)) !== null) {
    matches.push({
      index: compositeMatch.index,
      fullMatch: compositeMatch[0],
      insertedAttrs: compositeMatch[1],
      newParentList: compositeMatch[2],
      sharedList: compositeMatch[4],
    });
  }

  // Iterate backwards so indices to the left remain stable
  for (let i = matches.length - 1; i >= 0; i--) {
    const { index, fullMatch, insertedAttrs, newParentList, sharedList } = matches[i];
    const normalizedSharedList = normalizeListFragment(sharedList);
    
    // Search for deleted wrapper in result BEFORE index
    const matchedDeleted = findMatchingDeletedNestedListWrapper(
      result,
      index,
      normalizedSharedList,
    );
    if (!matchedDeleted) {
      continue;
    }
    
    // Replace both matchedDeletedWrapper and the fullMatch in result using precise slices
    // Since matchedDeleted.index < index, we can safely slice
    const beforeDeleted = result.slice(0, matchedDeleted.index);
    const betweenDeletedAndMatch = result.slice(
      matchedDeleted.index + matchedDeleted.wrapper.length,
      index,
    );
    const afterMatch = result.slice(index + fullMatch.length);
    
    const replacement = `<ins${insertedAttrs}>${newParentList}</ins>\n${sharedList}`;
    result = beforeDeleted + betweenDeletedAndMatch + replacement + afterMatch;
  }

  const insertedListOnlyRegex =
    /<ins([^>]*)>\s*(<(ul|ol|dl)[^>]*>[\s\S]*?<\/\3>)\s*<\/ins>/gi;

  const matches2: {
    index: number;
    fullMatch: string;
    sharedList: string;
  }[] = [];
  let insertedListOnlyMatch: RegExpExecArray | null;
  insertedListOnlyRegex.lastIndex = 0;
  while ((insertedListOnlyMatch = insertedListOnlyRegex.exec(result)) !== null) {
    matches2.push({
      index: insertedListOnlyMatch.index,
      fullMatch: insertedListOnlyMatch[0],
      sharedList: insertedListOnlyMatch[2],
    });
  }

  for (let i = matches2.length - 1; i >= 0; i--) {
    const { index, fullMatch, sharedList } = matches2[i];
    const normalizedSharedList = normalizeListFragment(sharedList);
    
    const matchedDeleted = findMatchingDeletedNestedListWrapper(
      result,
      index,
      normalizedSharedList,
    );
    if (!matchedDeleted) {
      continue;
    }
    
    const beforeDeleted = result.slice(0, matchedDeleted.index);
    const betweenDeletedAndMatch = result.slice(
      matchedDeleted.index + matchedDeleted.wrapper.length,
      index,
    );
    const afterMatch = result.slice(index + fullMatch.length);
    
    result = beforeDeleted + betweenDeletedAndMatch + sharedList + afterMatch;
  }

  return result;
}

export function fixInvalidNesting(html: string): string {
  let fixed = html;
  // 1. Fix order of closing tags for common inline elements
  const inlineTags = "strong|em|b|i|u|s|code|span|a|mark|sub|sup";
  const blockTags =
    "p|div|section|blockquote|pre|h[1-6]|li|ul|ol|table|tr|td|th";
  const noBlockOrDiff = `((?:(?!<\\/?(?:${blockTags}|ins|del)).)*?)`;

  const pattern = new RegExp(
    `<(ins|del)\\b([^>]*?)>${noBlockOrDiff}<\\/(${inlineTags})>${noBlockOrDiff}<\\/\\1>`,
    "gi",
  );
  fixed = fixed.replace(
    pattern,
    (match, t1, a1, c1, t2, c2) => {
      if (t2.toLowerCase() === "span" && /\bclass=["']?[^"']*\bkatex\b/i.test(match)) {
        return match;
      }
      return `<${t1}${a1}>${c1}${c2}</${t1}></${t2}>`;
    },
  );

  // 2. Remove redundant nested diff tags (e.g., <ins><ins>...</ins></ins>)
  fixed = fixed.replace(
    /<(ins|del)\b[^>]*>(\s*)<\1\b[^>]*>([\s\S]*?)<\/\1>(\s*)<\/\1>/gi,
    (m, tag, s1, content, s2) => {
      const cls = tag === "ins" ? "diffins" : "diffdel";
      return `<${tag} class="${cls}">${s1}${content}${s2}</${tag}>`;
    },
  );

  // 3. Fix cases where an inline tag is opened inside and closed outside (reversed)
  const reversePattern = new RegExp(
    `<(${inlineTags})\\b([^>]*?)>${noBlockOrDiff}<(ins|del)\\b([^>]*?)>${noBlockOrDiff}<\\/\\1>${noBlockOrDiff}<\\/\\4>`,
    "gi",
  );
  fixed = fixed.replace(
    reversePattern,
    (match, itag, iattrs, c1, dtag, dattrs, c2, c3) => {
      if (itag.toLowerCase() === "span" && /\bkatex\b/i.test(iattrs)) {
        return match;
      }
      const dclass = dtag === "ins" ? "diffins" : "diffdel";
      return `<${dtag} class="${dclass}">${c1}<${itag}${iattrs}>${c2}</${itag}>${c3}</${dtag}>`;
    },
  );

  // 4. Promote internal diffs to block level if they effectively cover the entire content of a block-like element.
  // This handles the "bad pairing" issue where htmldiff incorrectly shares block tags for unrelated content.
  const blockLikeTags = "p|li|div|h[1-6]|section|dt|dd";
  const blockRegex = new RegExp(
    `(<(${blockLikeTags})\\b[^>]*>)([\\s\\S]*?)(<\\/\\2>)`,
    "gi",
  );

  fixed = fixed.replace(blockRegex, (match, open, tag, content, close) => {
    // ALWAYS balance tags within the block first to prevent leaks
    const balancedContent = balanceDiffTags(content);
    
    // Only promote if the ENTIRE content is wrapped in diff tags,
    // AND they are all of the same type.
    const allIns = balancedContent.replace(/<ins\b[^>]*>([\s\S]*?)<\/ins>/gi, "").trim() === "";
    const allDel = balancedContent.replace(/<del\b[^>]*>([\s\S]*?)<\/del>/gi, "").trim() === "";

    if (allIns && !allDel) {
      const inner = balancedContent.replace(/<ins\b[^>]*>([\s\S]*?)<\/ins>/gi, "$1");
      return `<ins class="diffins diff-block">${open}${inner}${close}</ins>`;
    } else if (allDel && !allIns) {
      const inner = balancedContent.replace(/<del\b[^>]*>([\s\S]*?)<\/del>/gi, "$1");
      return `<del class="diffdel diff-block">${open}${inner}${close}</del>`;
    }

    return open + balancedContent + close;
  });

  return fixed;
}

export function normalizeListContainerChanges(html: string): string {
  return html.replace(
    /<(ol|ul|dl)([^>]*)>\s*<(ol|ul|dl)([^>]*)>([\s\S]*?)<\/\1>\s*<\/\3>/gi,
    (match, oldTag, oldAttrs, newTag, newAttrs, listBody) => {
      if (String(oldTag).toLowerCase() === String(newTag).toLowerCase()) {
        return match;
      }
      // Safety validation check: Ensure the listBody does not contain any other list container tags
      // to avoid matching across unrelated lists or nested list boundaries.
      if (/<(ol|ul|dl)\b/i.test(listBody) || /<\/(ol|ul|dl)>/i.test(listBody)) {
        return match;
      }
      return createStructuralListContainerDiff(
        oldTag,
        oldAttrs,
        listBody,
        newTag,
        newAttrs,
        listBody,
      );
    },
  );
}

export function createStructuralListContainerDiff(
  oldTag: string,
  oldAttrs: string,
  oldBody: string,
  newTag: string,
  newAttrs: string,
  newBody: string,
): string {
  const oldList = `<${oldTag}${oldAttrs}>${oldBody}</${oldTag}>`;
  const newList = `<${newTag}${newAttrs}>${newBody}</${newTag}>`;
  return `<del class="diffdel diff-block diff-list-container-change diff-list-container-change-old">${oldList}</del><ins class="diffins diff-block diff-list-container-change diff-list-container-change-new">${newList}</ins>`;
}

export function checkIfAllContentIsWrapped(
  html: string,
  type: "ins" | "del",
): boolean {
  const totalText = html.replace(/<[^>]+>/g, "").replace(/\s/g, "");
  const stripped = html.replace(
    new RegExp(`<${type}[^>]*?>[\\s\\S]*?<\\/${type}>`, "gi"),
    "",
  );
  const remaining = stripped.trim();
  return remaining.length === 0 && totalText.length > 0;
}

export function cleanInnerDiffTags(html: string, type: "ins" | "del"): string {
  const reOpen = new RegExp(`<${type}[^>]*?>`, "gi");
  const reClose = new RegExp(`<\\/${type}>`, "gi");
  return html.replace(reOpen, "").replace(reClose, "");
}

/**
 * Labels block-level diff tags with human-readable descriptions based on their content.
 */
export function labelBlockDiffTags(html: string): string {
  return html.replace(
    /<(ins|del)\b[^>]*class="[^"]*diff-block[^"]*"[^>]*>/gi,
    (match) => {
      if (match.includes("data-diff-label")) {
        return match;
      }
      let label = "";
      if (match.includes('class="mermaid"')) {
        label = "Mermaid Diagram";
      } else if (
        match.includes('class="katex-block"') ||
        match.includes('class="katex-display"')
      ) {
        label = "Block math";
      } else if (match.includes('class="markdown-alert"')) {
        label = "Alert";
      }

      if (label) {
        return match.replace(/>$/, ` data-diff-label="${label}">`);
      }
      return match;
    },
  );
}

/**
 * Verifies that the diff HTML contains all the significant content from the modified version.
 * If significant content is missing, it indicates a catastrophic failure in htmldiff alignment.
 */
export function verifyDiffIntegrity(
  newHtml: string,
  diffHtml: string,
): boolean {
  const strip = (html: string) => {
    return html
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const newText = strip(newHtml);

  // We want to ensure that all words from the modified version are present
  // in the "new" side of the diff (Shared + Inserted).
  // Therefore, we must EXCLUDE <del> blocks from the integrity check.
  const diffNewSideHtml = diffHtml.replace(
    /<del\b[^>]*>[\s\S]*?<\/del>/gi,
    " ",
  );
  const diffText = strip(diffNewSideHtml);

  // We check for all alphanumeric words to ensure total integrity.
  const getWords = (text: string) => {
    // Match letters and numbers across any language (using Unicode property escapes)
    return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  };

  const newWords = getWords(newText);
  if (newWords.length === 0) {
    return true; // Nothing to check
  }

  const diffWordsMap = new Map<string, number>();
  for (const word of getWords(diffText)) {
    diffWordsMap.set(word, (diffWordsMap.get(word) || 0) + 1);
  }

  const newWordsMap = new Map<string, number>();
  for (const word of newWords) {
    newWordsMap.set(word, (newWordsMap.get(word) || 0) + 1);
  }

  let missingCount = 0;
  let totalChecked = 0;
  const missingWords: string[] = [];

  for (const [word, newCount] of newWordsMap.entries()) {
    const diffCount = diffWordsMap.get(word) || 0;
    if (diffCount < newCount) {
      missingCount += (newCount - diffCount);
      if (missingWords.length < 10) {
        missingWords.push(word);
      }
    }
    totalChecked += newCount;
  }

  const failureThreshold = 0.02; // 2.0% margin of error
  const missingRatio = totalChecked > 0 ? missingCount / totalChecked : 0;
  const isBroken = missingRatio > failureThreshold;

  if (isBroken) {
    console.warn(
      `Integrity check failed: missing ${missingCount}/${totalChecked} words (${(missingRatio * 100).toFixed(1)}%). Missing: ${missingWords.join(", ")}`,
    );
    return false;
  }

  return true;
}

export function restoreCheckboxes(
  html: string,
  tokens: Record<string, string>,
): string {
  const keys = Object.keys(tokens);
  if (keys.length === 0) {
    return html;
  }

  // Escape keys for regex
  const escapedKeys = keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const combinedRegex = new RegExp(escapedKeys.join("|"), "gi");

  return html.replace(combinedRegex, (match) => {
    // Find the original token key (case-insensitive)
    const originalKey = keys.find((k) => k.toUpperCase() === match.toUpperCase());
    if (originalKey !== undefined) {
      return tokens[originalKey];
    }
    return match;
  });
}
