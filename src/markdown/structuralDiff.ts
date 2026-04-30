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
    tokenizeListContainers
  });
  const { html: newT, tokens: t2 } = replaceComplexBlocksWithTokens(newHtml, { 
    tokenizeCodeBlocks,
    tokenizeListContainers
  });

  // 2. Mask block attributes to prevent noise from IDs, classes, and line numbers
  const sharedToken = `data-attr-masked-${Math.random().toString(36).substring(2, 10)}`;
  const { masked: oldMasked, attributePools: oldPools } = maskBlockAttributes(oldT, sharedToken);
  const { masked: newMasked, attributePools: newPools } = maskBlockAttributes(newT, sharedToken);

  // 3. Materialize checkboxes into text to ensure htmldiff detects state changes
  const { html: oldM, tokens: cbTokensOld } = materializeCheckboxes(oldMasked);
  const { html: newM, tokens: cbTokensNew } = materializeCheckboxes(newMasked);

  const localTokens = { ...allTokens, ...t1, ...t2, ...cbTokensOld, ...cbTokensNew };

  let diff = execute(oldM, newM);

  // Restore the original attributes into the diff IMMEDIATELY after htmldiff
  // to prevent structural manipulations (like nesting fixes and block consolidation) 
  // from causing pointer drift.
  diff = restoreBlockAttributes(diff, oldPools, newPools, sharedToken);

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
    console.warn("Structural diff failed integrity check. Falling back to raw diff.");
    let fallbackDiff = execute(oldHtml, newHtml);
    // Even in fallback, we still want to apply basic cleanup to ensure valid HTML
    fallbackDiff = fixInvalidNesting(fallbackDiff);
    return { diff: fallbackDiff, tokens: {} };
  }

  // Apply post-restoration refinements (like list Ghost items)
  if (!options.skipRefinement) {
    restored = applyStructuralDiffPipeline(restored, execute, localTokens);
  }

  return { diff: restored, tokens: localTokens };
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
  result = splitConsolidatedDiffs(result);

  const skipRefinementExecute = (old: string, newVal: string, options: { tokenizeListContainers?: boolean } = {}) =>
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
export function cleanupUnbalancedDiffTags(html: string): string {
  let result = html;
  // Fix cases like <section></del></ins> which happen if htmldiff gets confused by fragments
  result = result.replace(/<section>\s*<\/del>\s*<\/ins>/gi, '<section>');
  result = result.replace(/<section>\s*<\/ins>\s*<\/del>/gi, '<section>');

  // Fix inverted closing tags inside content
  result = result.replace(/<\/del>\s*<\/ins>/g, '</ins></del>');

  
  // Remove empty diff tags
  result = result.replace(/<(ins|del)[^>]*>\s*<\/\1>/gi, '');
  
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
    
    // Pattern 1: <outer><inner>CONTENT</inner></outer> where outer and inner are different (del/ins)
    // This is logically impossible and usually caused by htmldiff getting confused by block changes.
    // We unwrap the outer tag because it's usually the one hiding the inner one in split view.
    result = result.replace(/<(del|ins)([^>]*)>(\s*)<(ins|del)([^>]*)>([\s\S]*?)<\/\4>(\s*)<\/\1>/gi, 
      (match, t1, a1, s1, t2, a2, content, s2) => {
        if (t1.toLowerCase() === t2.toLowerCase()) {
          // Double wrapping of same type: just consolidate them
          return `<${t1}${a1}>${content}</${t1}>`;
        }
        // Opposite types: unwrap outer to ensure visibility in one of the panes
        // BUT merge attributes (like diff-block class) to the inner tag
        let mergedA2 = a2;
        if (a1.includes("diff-block") && !a2.includes("diff-block")) {
          if (mergedA2.includes('class="')) {
            mergedA2 = mergedA2.replace(/class="([^"]*)"/i, 'class="$1 diff-block"');
          } else {
            mergedA2 += ' class="diff-block"';
          }
        }
        return s1 + `<${t2}${mergedA2}>${content}</${t2}>` + s2;
      }
    );

    // Pattern 2: <outer>...<inner>CONTENT</inner>...</outer> where inner is a different type
    // and covers most of the content. This is a bit riskier but helps with Slide 1 disappearing.
    // However, let's stick to Pattern 1 first as it's the most common failure mode.

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

      const delRemaining = delContent.replace(blocksRegex, "").trim();
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
    "h[1-6]|p|blockquote|pre|div|table|ul|ol|dl|section|li|tr|th|td";
  
  // Exclude already masked tags
  const regex = new RegExp(`(<(?:${blockTags}))(\\s+(?!data-attr-masked-)[^>]*?)(>)`, "gi");

  const token = providedToken || `data-attr-masked-${Math.random().toString(36).substring(2, 10)}`;

  const masked = html.replace(regex, (match, tag, attrs, close, offset) => {
    // Normalize attributes for hashing by stripping volatile parts (data-line)
    const normalized = attrs.replace(/\s*data-line(-end)?="[^"]*"/g, "").trim();
    
    // Include tag name and a snippet of the inner content to make the hash more unique
    // while still being stable enough for htmldiff to match identical/similar blocks.
    const tagName = tag.substring(1).toLowerCase();
    
    // Peek at the content immediately following the tag (up to 20 chars, stripping tags)
    const contentSnippet = html.substring(offset + match.length, offset + match.length + 50)
      .replace(/<[^>]+>/g, "")
      .substring(0, 20)
      .trim();
      
    const hash = crypto.createHash("md5")
      .update(`${tagName}|${normalized}|${contentSnippet}`)
      .digest("hex")
      .substring(0, 8);
    
    const key = `${token}-${hash}`;
    if (!attributePools[key]) {
      attributePools[key] = [];
    }
    attributePools[key].push(attrs);
    
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

  const tokenRegex = new RegExp(`${token}-([a-f0-9]{8})="true"`, "g");
  
  return diffHtml.replace(tokenRegex, (match, hash, offset) => {
    const key = `${token}-${hash}`;
    const prefix = diffHtml.substring(0, offset);
    
    const tags = prefix.match(/<\/?(ins|del)[^>]*>/gi) || [];
    let inIns = false;
    let inDel = false;
    for (const tag of tags) {
      if (tag.toLowerCase().startsWith("<ins")) {
        inIns = true;
      } else if (tag.toLowerCase().startsWith("</ins")) {
        inIns = false;
      } else if (tag.toLowerCase().startsWith("<del")) {
        inDel = true;
      } else if (tag.toLowerCase().startsWith("</del")) {
        inDel = false;
      }
    }

    let res;
    if (inDel) {
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
      if (!inIns) {
          oldCounters[key] = (oldCounters[key] || 0) + 1;
      }
    }
    
    return res;
  });
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
    const hash = crypto.createHash("md5").update(match).digest("hex").substring(0, 8);
    const token = `CBTOKEN_${index}_${hash}_${state}`;
    
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
    if (
      html.startsWith('<p class="katex-block">', i) ||
      html.startsWith("<p class='katex-block'>", i)
    ) {
      const start = i;
      const end = findClosing(html, i, "p");
      if (end > -1) {
        const content = html.substring(start, end);
        const token = createToken(content, "MATHBLOCK", tokens);
        result += token;
        i = end;
        continue;
      }
    }

    if (
      html.startsWith('<span class="katex">', i) ||
      html.startsWith("<span class='katex'>", i)
    ) {
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

    // Tables (already covered by listRegex, but keeping for compatibility if listRegex doesn't match for some reason)
    if (html.startsWith("<table", i)) {
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

export function findClosing(
  html: string,
  start: number,
  tagName: string,
): number {
  let depth = 0;
  const tagNameLower = tagName.toLowerCase();
  const openTagBase = `<${tagNameLower}`;
  const closeTag = `</${tagNameLower}>`;

  for (let i = start; i < html.length; i++) {
    if (html[i] === "<") {
      // Check for opening tag with word boundary
      // Optimized: slice and toLowerCase only the necessary part
      if (html.slice(i, i + openTagBase.length).toLowerCase() === openTagBase) {
        const charAfter = html[i + openTagBase.length];
        if (!charAfter || /[\s/>]/.test(charAfter)) {
          depth++;
        }
      } else if (html.slice(i, i + closeTag.length).toLowerCase() === closeTag) {
        depth--;
        if (depth === 0) {
          return i + closeTag.length;
        }
      }
    }
  }
  return -1;
}

export function createToken(
  content: string,
  prefix: string,
  tokens: Record<string, string>,
): string {
  // For LINEBLOCK tokens, we want to include the data-line attribute in the hash
  // so that content on different lines is treated as distinct by htmldiff.
  // For other blocks (MATH, etc.), we strip them to allow granular diffing.
  const hashContent =
    prefix === "LINEBLOCK"
      ? content
      : content.replace(/\s?data-line(?:-end)?="[^"]*"/g, "");

  const hash = crypto
    .createHash("sha256")
    .update(hashContent)
    .digest("hex")
    .substring(0, 12);
  const token = `TOKEN_${prefix}_${hash}`;

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
      const alertCount = (
        newInner.match(/<div[^>]*class="markdown-alert/g) || []
      ).length;
      if (alertCount > 1) {
        return match;
      }

      const titleRegex = /<p class="markdown-alert-title">([\s\S]*?)<\/p>/;
      const oldTitleMatch = oldInner.match(titleRegex);
      const newTitleMatch = newInner.match(titleRegex);

      if (
        oldTitleMatch &&
        newTitleMatch &&
        oldTitleMatch[0] === newTitleMatch[0]
      ) {
        const titleHtml = oldTitleMatch[0];
        const oldBody = oldInner.replace(titleHtml, "").trim();
        const newBody = newInner.replace(titleHtml, "").trim();
        const diffBody = execute(oldBody, newBody);
        const openTagRegex = /^<div class="markdown-alert[^>]*>/;
        const openTagMatch = newInner.match(openTagRegex);
        const openTag = openTagMatch
          ? openTagMatch[0]
          : '<div class="markdown-alert">';
        return `${openTag}${titleHtml}\n${diffBody}</div>`;
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
        { tokenizeListContainers: false }
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

      const usedNewFootnotes = new Set<number>();
      let res = "";

      oldFootnotes.forEach((oldFootnote: string) => {
        const oldId = getFootnoteId(oldFootnote);
        let matchedIndex = -1;

        if (oldId) {
          matchedIndex = newFootnotes.findIndex(
            (newFootnote: string, index: number) =>
              !usedNewFootnotes.has(index) &&
              getFootnoteId(newFootnote) === oldId,
          );
        }

        if (
          matchedIndex === -1 &&
          oldFootnotes.length === newFootnotes.length
        ) {
          matchedIndex = newFootnotes.findIndex(
            (_newFootnote: string, index: number) =>
              !usedNewFootnotes.has(index),
          );
        }

        if (matchedIndex !== -1) {
          usedNewFootnotes.add(matchedIndex);
          res += execute(oldFootnote, newFootnotes[matchedIndex]);
        } else {
          res += `<del class="diffdel">${oldFootnote}</del>`;
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
  // Instead, collect all del-wrapped and ins-wrapped <pre> blocks globally, pair them by index,
  // re-diff each pair, and substitute back via placeholder tokens.
  {
    const delPreRegex = /<del([^>]*)>\s*<pre([^>]*)>([\s\S]*?)<\/pre>\s*<\/del>/gi;
    const insPreRegex = /<ins([^>]*)>\s*<pre([^>]*)>([\s\S]*?)<\/pre>\s*<\/ins>/gi;

    interface PreBlock { full: string; delAttrs: string; preAttrs: string; inner: string }
    const delBlocks: PreBlock[] = [];
    const insBlocks: PreBlock[] = [];

    let m: RegExpExecArray | null;
    while ((m = delPreRegex.exec(resultHtml)) !== null) {
      delBlocks.push({ full: m[0], delAttrs: m[1], preAttrs: m[2], inner: m[3] });
    }
    while ((m = insPreRegex.exec(resultHtml)) !== null) {
      insBlocks.push({ full: m[0], delAttrs: m[1], preAttrs: m[2], inner: m[3] });
    }

    const pairCount = Math.min(delBlocks.length, insBlocks.length);
    if (pairCount > 0) {
      const diffedPairs: Array<{ delFull: string; insFull: string; diffed: string }> = [];
      for (let i = 0; i < pairCount; i++) {
        // Diff ONLY the inner content of the pre block
        const innerDiff = diffCodeBlocks(delBlocks[i].inner, insBlocks[i].inner);
        diffedPairs.push({
          delFull: delBlocks[i].full,
          insFull: insBlocks[i].full,
          diffed: `<pre${insBlocks[i].preAttrs}>${innerDiff}</pre>`,
        });
      }

      for (let i = 0; i < diffedPairs.length; i++) {
        const placeholder = `PREDIFF_${i}_${Date.now()}_PLACEHOLDER`;
        resultHtml = resultHtml.replace(diffedPairs[i].delFull, () => placeholder);
        resultHtml = resultHtml.replace(diffedPairs[i].insFull, () => "");
        diffedPairs[i].delFull = placeholder;
      }
      for (let i = 0; i < diffedPairs.length; i++) {
        resultHtml = resultHtml.replace(diffedPairs[i].delFull, () => diffedPairs[i].diffed);
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
      // Wrap the changed image pair in a consolidated container
      // Note: We intentionally discard the wrapping <p> if it was matched to prevent <div> inside <p>
      // BUT we preserve its attributes (like data-line) for mapping.
      const attrs = pAttrs ? pAttrs : "";
      return `<div class="image-diff-block" data-image-diff="true" ${attrs}>
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
        match.includes("katex-block") ||
        match.includes("katex-display") ||
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
          if (/<(ins|del)\b[^>]*class="[^"]*diff-block[^"]*"[^>]*>[\s\n]*$/i.test(before)) {
            return match;
          }
          return `<ins class="diffins diff-block">${cleanInnerDiffTags(match, "ins")}</ins>`;
        }
      } else if (hasDel && !hasIns) {
        if (checkIfAllContentIsWrapped(match, "del")) {
          const before = result.substring(0, offset);
          if (/<(ins|del)\b[^>]*class="[^"]*diff-block[^"]*"[^>]*>[\s\n]*$/i.test(before)) {
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

  return result;
}

export function cleanupCheckboxArtifacts(html: string): string {
  return html.replace(
    /(<input[^>]+class="task-list-item-checkbox"[^>]*>)(\s*)(?=(?:<p\b|<div\b|<ins[^>]*>\s*\[))/gi,
    '<del class="diffdel">$1</del>$2',
  );
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
  // 1. First, handle cases where the whole <li> is wrapped in <ins> or <del>
  let result = html.replace(
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

  // 2. Then handle cases where the markers are INSIDE the <li>
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
          .replace(/<\/?(strong|em|b|i|concept|code|s|span|a|p|div|br|section)\b[^>]*>/gi, "")
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
  ): string | null => {
    const prefix = sourceHtml.slice(0, beforeIndex);
    const deletedNestedListRegex =
      /(?:<del[^>]*>\s*<\/del>\s*)?<del[^>]*class="[^"]*diff-block[^"]*"[^>]*>\s*(<(ul|ol|dl)[^>]*>[\s\S]*?<\/\2>)\s*<\/del>(?:\s*<del[^>]*>\s*<\/del>\s*)*/gi;
    let deletedMatch: RegExpExecArray | null;
    let matchedDeletedWrapper: string | null = null;
    while ((deletedMatch = deletedNestedListRegex.exec(prefix)) !== null) {
      const deletedList = deletedMatch[1];
      if (normalizeListFragment(deletedList) === normalizedSharedList) {
        matchedDeletedWrapper = deletedMatch[0];
      }
    }
    return matchedDeletedWrapper;
  };

  const insertedCompositeRegex =
    /<ins([^>]*)>\s*(<(ol|ul|dl)[^>]*>\s*<li[\s\S]*?<\/li>\s*<\/\3>)\s*(<(ul|ol|dl)[^>]*>[\s\S]*?<\/\5>)\s*<\/ins>(?:\s*<ins[^>]*>\s*<\/ins>\s*)*/gi;

  let result = html;
  let compositeMatch: RegExpExecArray | null;
  while ((compositeMatch = insertedCompositeRegex.exec(html)) !== null) {
    const fullInsertedBlock = compositeMatch[0];
    const insertedAttrs = compositeMatch[1];
    const newParentList = compositeMatch[2];
    const sharedList = compositeMatch[4];
    const normalizedSharedList = normalizeListFragment(sharedList);
    const insertedBlockIndex = result.indexOf(fullInsertedBlock);
    if (insertedBlockIndex === -1) {
      continue;
    }
    const matchedDeletedWrapper = findMatchingDeletedNestedListWrapper(
      result,
      insertedBlockIndex,
      normalizedSharedList,
    );
    if (!matchedDeletedWrapper) {
      continue;
    }
    result = result.replace(matchedDeletedWrapper, "");
    result = result.replace(
      fullInsertedBlock,
      `<ins${insertedAttrs}>${newParentList}</ins>\n${sharedList}`,
    );
  }

  const insertedListOnlyRegex =
    /<ins([^>]*)>\s*(<(ul|ol|dl)[^>]*>[\s\S]*?<\/\3>)\s*<\/ins>/gi;

  let insertedListOnlyMatch: RegExpExecArray | null;
  while (
    (insertedListOnlyMatch = insertedListOnlyRegex.exec(result)) !== null
  ) {
    const fullInsertedBlock = insertedListOnlyMatch[0];
    const sharedList = insertedListOnlyMatch[2];
    const normalizedSharedList = normalizeListFragment(sharedList);
    const insertedBlockIndex = result.indexOf(fullInsertedBlock);
    if (insertedBlockIndex === -1) {
      continue;
    }
    const matchedDeletedWrapper = findMatchingDeletedNestedListWrapper(
      result,
      insertedBlockIndex,
      normalizedSharedList,
    );
    if (!matchedDeletedWrapper) {
      continue;
    }
    result = result.replace(matchedDeletedWrapper, "");
    result = result.replace(fullInsertedBlock, sharedList);
  }
  return result;
}

export function fixInvalidNesting(html: string): string {
  let fixed = html;
  // 1. Fix order of closing tags for common inline elements
  const inlineTags = "strong|em|b|i|u|s|code|span|a|mark|sub|sup";
  const blockTags = "p|div|section|blockquote|pre|h[1-6]|li|ul|ol|table|tr|td|th";
  const noBlockOrDiff = `((?:(?!<\\/?(?:${blockTags}|ins|del)).)*?)`;
  
  const pattern = new RegExp(
    `<(ins|del)\\b([^>]*?)>${noBlockOrDiff}<\\/(${inlineTags})>${noBlockOrDiff}<\\/\\1>`,
    "gi",
  );
  fixed = fixed.replace(pattern, "<$1$2>$3$5</$4></$1>");

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
  fixed = fixed.replace(reversePattern, (match, itag, iattrs, c1, dtag, dattrs, c2, c3) => {
    const dclass = dtag === "ins" ? "diffins" : "diffdel";
    return `<${dtag} class="${dclass}">${c1}<${itag}${iattrs}>${c2}</${itag}>${c3}</${dtag}>`;
  });

  // 4. Promote internal diffs to block level if they effectively cover the entire content of a block-like element.
  // This handles the "bad pairing" issue where htmldiff incorrectly shares block tags for unrelated content.
  const blockLikeTags = "p|li|div|h[1-6]|section";
  const blockRegex = new RegExp(`(<(${blockLikeTags})\\b[^>]*>)([\\s\\S]*?)(<\\/\\2>)`, "gi");

  fixed = fixed.replace(blockRegex, (match, open, tag, content, close) => {
    // If there is more than one top-level diff tag, don't promote (it's a partial change)
    const diffTags = content.match(/<(ins|del)\b[^>]*>/gi);
    if (!diffTags || diffTags.length !== 1) {
      return match;
    }

    const singleDiffRegex = /<(ins|del)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    const stripped = content.replace(singleDiffRegex, "").trim();

    // If the stripped content has any actual content (text or tags), don't promote
    if (stripped.trim() !== "") {
      return match;
    }

    // It's a candidate! Extract the diff type and promoted inner content
    const m = singleDiffRegex.exec(content);
    if (m) {
      const type = m[1];
      const diffClass = type === "ins" ? "diffins" : "diffdel";
      // Construct inner content by replacing the <ins>...</ins> with its own content
      // but keeping the surrounding "boilerplate" tags (like KaTeX spans)
      const inner = content.replace(m[0], m[2]);
      return `<${type} class="${diffClass} diff-block">${open}${inner}${close}</${type}>`;
    }

    return match;
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
export function verifyDiffIntegrity(newHtml: string, diffHtml: string): boolean {
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
  const diffNewSideHtml = diffHtml.replace(/<del\b[^>]*>[\s\S]*?<\/del>/gi, " ");
  const diffText = strip(diffNewSideHtml);

  // We check for all alphanumeric words to ensure total integrity.
  const getWords = (text: string) => {
    return text.toLowerCase().match(/[a-z0-9]+/g) || [];
  };

  const newWords = getWords(newText);
  if (newWords.length === 0) {
    return true; // Nothing to check
  }

  const diffWordsSet = new Set(getWords(diffText));
  
  // Sample a subset of words to check to avoid performance issues on huge documents
  // but ensure we check enough to detect truncation.
  const sampleSize = Math.min(newWords.length, 200);
  const step = Math.max(1, Math.floor(newWords.length / sampleSize));
  
  let missingCount = 0;
  for (let i = 0; i < newWords.length; i += step) {
    const word = newWords[i];
    if (!diffWordsSet.has(word)) {
      missingCount++;
    }
  }

  // Allow a very small margin of error (e.g. 2%) for edge cases where htmldiff 
  // might legitimately combine or slightly transform words (e.g. case changes, punctuation).
  const failureThreshold = 0.02;
  const isBroken = (missingCount / sampleSize) > failureThreshold;

  if (isBroken) {
    return false;
  }

  return true;
}
