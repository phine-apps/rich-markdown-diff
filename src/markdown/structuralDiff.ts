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
  options: { skipRefinement?: boolean; tokenizeCodeBlocks?: boolean } = {},
): { diff: string; tokens: Record<string, string> } {
  // 1. Identify complex blocks FIRST to protect them from fragmentation
  const tokenizeCodeBlocks = options.tokenizeCodeBlocks !== false;
  const { html: oldT, tokens: t1 } = replaceComplexBlocksWithTokens(oldHtml, { tokenizeCodeBlocks });
  const { html: newT, tokens: t2 } = replaceComplexBlocksWithTokens(newHtml, { tokenizeCodeBlocks });

  // 2. Mask block attributes to prevent noise from IDs, classes, and line numbers
  const { masked: oldMasked, attributes: oldAttrs } = maskBlockAttributes(oldT);
  const { masked: newMasked, attributes: newAttrs } = maskBlockAttributes(newT);

  const localTokens = { ...allTokens, ...t1, ...t2 };

  let diff = execute(oldMasked, newMasked);

  // Apply pre-restoration fixes (like nesting and checkboxes)
  diff = applyPreRestorePipeline(diff);

  // 4. Token restoration
  let restored = restoreComplexTokens(diff, localTokens);

  // Apply post-restoration refinements (like list Ghost items)
  if (!options.skipRefinement) {
    restored = applyStructuralDiffPipeline(restored, execute, localTokens);
  }

  // Restore the original attributes into the diff
  restored = restoreBlockAttributes(restored, oldAttrs, newAttrs);

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
  result = splitMixedBlockInsertions(result);
  result = splitConsolidatedDiffs(result);

  const skipRefinementExecute = (old: string, newVal: string) =>
    diffHtmlFragments(old, newVal, execute, {
      allTokens,
      skipRefinement: true,
    });

  result = refineBlockDiffs(result, skipRefinementExecute, allTokens);
  result = consolidateBlockDiffs(result);
  result = wrapHeadingPrefixes(result);
  result = extractSharedReparentedLists(result);
  result = markGhostListItems(result);
  result = consolidateWrappedItems(result);
  result = fixInvalidNesting(result);
  result = normalizeListContainerChanges(result);
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

  // First, look for pairs of <del> and <ins> that both contain multiple blocks
  // This is where interleaving is most effective.
  let result = html.replace(
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
  // Fix <li><ins>...</ins></li> -> <ins><li>...</li></ins>
  // Robust against whitespace and attributes
  return html.replace(
    /<(li|h[1-6]|p|blockquote)([^>]*)>\s*<(ins|del)[^>]*>\s*([\s\S]*?)\s*<\/\3>\s*<\/\1>/gi,
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
export function maskBlockAttributes(html: string): {
  masked: string;
  attributes: string[];
} {
  const attributes: string[] = [];
  const blockTags =
    "h[1-6]|p|blockquote|pre|div|table|ul|ol|dl|section|li|tr|th|td";
  const regex = new RegExp(`(<(?:${blockTags}))(\\s+[^>]*?)(>)`, "gi");

  const masked = html.replace(regex, (match, tag, attrs, close) => {
    attributes.push(attrs);
    return `${tag} data-attr="MASKED"${close}`;
  });
  return { masked, attributes };
}

/**
 * Restores the original attributes into the diff HTML.
 */
export function restoreBlockAttributes(
  diffHtml: string,
  attrsOld: string[],
  attrsNew: string[],
): string {
  let oldIdx = 0;
  let newIdx = 0;

  return diffHtml.replace(/data-attr="MASKED"/g, (match, offset) => {
    const prefix = diffHtml.substring(0, offset);
    const lastInsOpen = prefix.lastIndexOf("<ins");
    const lastInsClose = prefix.lastIndexOf("</ins>");
    const lastDelOpen = prefix.lastIndexOf("<del");
    const lastDelClose = prefix.lastIndexOf("</del>");

    const isInsideIns = lastInsOpen > lastInsClose;
    const isInsideDel = lastDelOpen > lastDelClose;

    if (isInsideDel) {
      return attrsOld[oldIdx++] || "";
    } else if (isInsideIns) {
      return attrsNew[newIdx++] || "";
    } else {
      // Shared: consume from both to keep pointers aligned
      const val = attrsNew[newIdx++] || "";
      oldIdx++;
      return val;
    }
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
  } = {},
): {
  html: string;
  tokens: Record<string, string>;
} {
  const tokens: Record<string, string> = {};
  return replaceBalancedTags(html, tokens, {
    tokenizeListContainers: options.tokenizeListContainers,
    tokenizeCodeBlocks: options.tokenizeCodeBlocks ?? true,
  });
}

export function replaceCheckboxesWithTokens(html: string): {
  html: string;
  tokens: Record<string, string>;
} {
  const tokens: Record<string, string> = {};
  const regex = /<input[^>]+class="task-list-item-checkbox"[^>]*>/gi;

  const result = html.replace(regex, (match) => {
    const token = createToken(match, "CHECKBOX", tokens);
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
  } = {},
): { html: string; tokens: Record<string, string> } {
  let result = "";
  let i = 0;

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

    // List and Table containers
    if (options.tokenizeListContainers !== false && html[i] === "<") {
      const listMatch = html
        .substring(i)
        .match(/^<(ol|ul|dl|table)(\s[^>]*)?>/i);
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

    // Tables
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
      if (html.toLowerCase().startsWith(openTagBase, i)) {
        const charAfter = html[i + openTagBase.length];
        if (!charAfter || /[\s/>]/.test(charAfter)) {
          depth++;
        }
      } else if (html.toLowerCase().startsWith(closeTag, i)) {
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

  while (hasMoreTokens && iterations < MAX_ITERATIONS) {
    hasMoreTokens = false;
    const prev = restored;

    // Sort keys by length descending to replace longest/most-specific tokens first
    const keys = Object.keys(tokens).sort((a, b) => b.length - a.length);

    for (const token of keys) {
      if (restored.includes(token)) {
        restored = restored.replace(new RegExp(token, "g"), tokens[token]);
        hasMoreTokens = true;
      }
    }

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

      return execute(
        `<${oldTag}${oldAttrs}>${oldContent}</${oldTag}>`,
        `<${newTag}${newAttrs}>${newContent}</${newTag}>`,
      );
    },
  );

  const footnoteBundleRegex =
    /<del[^>]*>\s*((?:<li[^>]*>[\s\S]*?<\/li>\s*)+)<\/del>\s*<ins[^>]*>\s*((?:<li[^>]*>[\s\S]*?<\/li>\s*)+)<\/ins>/gi;
  const footnoteItemRegex = /<li[^>]*>[\s\S]*?<\/li>/gi;
  const getFootnoteId = (itemHtml: string) =>
    itemHtml.match(/\bid=["']([^"']+)["']/i)?.[1] ?? null;

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
    const delPreRegex = /<del([^>]*)>\s*(<pre[^>]*>[\s\S]*?<\/pre>)\s*<\/del>/gi;
    const insPreRegex = /<ins([^>]*)>\s*(<pre[^>]*>[\s\S]*?<\/pre>)\s*<\/ins>/gi;

    interface PreBlock { full: string; attrs: string; inner: string }
    const delBlocks: PreBlock[] = [];
    const insBlocks: PreBlock[] = [];

    let m: RegExpExecArray | null;
    while ((m = delPreRegex.exec(resultHtml)) !== null) {
      delBlocks.push({ full: m[0], attrs: m[1], inner: m[2] });
    }
    while ((m = insPreRegex.exec(resultHtml)) !== null) {
      insBlocks.push({ full: m[0], attrs: m[1], inner: m[2] });
    }

    const pairCount = Math.min(delBlocks.length, insBlocks.length);
    if (pairCount > 0) {
      // Compute diffed replacements for each pair
      const diffedPairs: Array<{ delFull: string; insFull: string; diffed: string }> = [];
      for (let i = 0; i < pairCount; i++) {
        diffedPairs.push({
          delFull: delBlocks[i].full,
          insFull: insBlocks[i].full,
          diffed: diffCodeBlocks(delBlocks[i].inner, insBlocks[i].inner),
        });
      }

      // Replace del blocks with placeholders, remove ins blocks
      for (let i = 0; i < diffedPairs.length; i++) {
        resultHtml = resultHtml.replace(diffedPairs[i].delFull, `PREDIFF_${i}_PLACEHOLDER`);
        resultHtml = resultHtml.replace(diffedPairs[i].insFull, '');
      }
      // Replace placeholders with diffed content
      for (let i = 0; i < diffedPairs.length; i++) {
        resultHtml = resultHtml.replace(`PREDIFF_${i}_PLACEHOLDER`, diffedPairs[i].diffed);
      }
    }
  }

  const blockquoteRegex =
    /(<del[^>]*>\s*(<blockquote>[\s\S]*?<\/blockquote>)\s*<\/del>)\s*(<ins[^>]*>\s*(<blockquote>[\s\S]*?<\/blockquote>)\s*<\/ins>)/gi;

  resultHtml = resultHtml.replace(
    blockquoteRegex,
    (match, delBlock, oldInner, insBlock, newInner) => {
      return execute(oldInner, newInner);
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
        /class=["'][^"']*(?:mermaid|markdown-alert)[^"']*["']/i.test(
          attributes,
        )
      ) {
        return match;
      }

      // Re-run the diff on the inner content to restore granularity
      const innerDiff = execute(delInner, insInner);

      return `<${insTag}${attributes}>${innerDiff}</${insTag}>`;
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
    /(?:<p[^>]*>\s*)?(<del[^>]*>\s*(<img[^>]*>)\s*<\/del>)\s*(<ins[^>]*>\s*(<img[^>]*>)\s*<\/ins>)(?:\s*<\/p>)?/gi;

  resultHtml = resultHtml.replace(
    imageRegex,
    (match, delBlock, oldImg, insBlock, newImg) => {
      // Wrap the changed image pair in a consolidated container
      // Note: We intentionally discard the wrapping <p> if it was matched to prevent <div> inside <p>
      return `<div class="image-diff-block" data-image-diff="true">
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
    result = result.replace(regex, (match) => {
      // EXCEPTION: Don't consolidate math blocks into block-level diffs.
      // This keeps the diff tags internal and prevents the 'Upstream INS' problem.
      if (
        match.includes("katex-block") ||
        match.includes("katex-display") ||
        match.includes("TOKEN_MATH")
      ) {
        return match;
      }

      const hasIns = /<ins\b[^>]*>([\s\S]*?)<\/ins>/gi.test(match);
      const hasDel = /<del\b[^>]*>([\s\S]*?)<\/del>/gi.test(match);

      if (hasIns && !hasDel) {
        if (checkIfAllContentIsWrapped(match, "ins")) {
          return `<ins class="diffins diff-block">${cleanInnerDiffTags(match, "ins")}</ins>`;
        }
      } else if (hasDel && !hasIns) {
        if (checkIfAllContentIsWrapped(match, "del")) {
          return `<del class="diffdel diff-block">${cleanInnerDiffTags(match, "del")}</del>`;
        }
      }
      return match;
    });
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

export function splitMixedBlockInsertions(html: string): string {
  const tagTypes: Array<"ins" | "del"> = ["ins", "del"];
  let result = html;
  for (const diffTag of tagTypes) {
    const diffClass = diffTag === "ins" ? "diffins" : "diffdel";
    const regex = new RegExp(
      `<${diffTag}\\b[^>]*>([\\s\\S]*?)<\\/${diffTag}>`,
      "gi",
    );
    result = result.replace(regex, (match, inner: string) => {
      const headingCount = (inner.match(/<h[1-6][\s>]/gi) || []).length;
      if (headingCount === 0) {
        return match;
      }
      const parts = inner.split(/(?=<[a-z1-6]+)/i);
      if (parts.length <= 1) {
        return match;
      }
      return parts
        .map((part) => {
          const trimmed = part.trim();
          if (!trimmed) {
            return "";
          }
          // Wrap if it looks like a tag or content
          return `<${diffTag} class="${diffClass}">${trimmed}</${diffTag}>`;
        })
        .join("\n");
    });
  }
  return result;
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
      const stripInline = (s: string) =>
        s
          .replace(/<\/?(strong|em|b|i|concept|code|s|span|a)\b[^>]*>/gi, "")
          .trim();

      const withoutIns = content.replace(/<ins\b[^>]*>[\s\S]*?<\/ins>/gi, "");
      const withoutDel = content.replace(/<del\b[^>]*>[\s\S]*?<\/del>/gi, "");
      let newAttrs = attrs;

      if (stripInline(withoutIns) === "") {
        newAttrs += ' data-all-inserted="true"';
      }
      if (stripInline(withoutDel) === "") {
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
  const tags = ["em", "strong", "b", "i", "code", "span", "a"];
  let fixed = html;
  tags.forEach((tag) => {
    const reIns = new RegExp(`<\/ins><\/${tag}>`, "g");
    const reDel = new RegExp(`<\/del><\/${tag}>`, "g");
    fixed = fixed.replace(reIns, `</${tag}></ins>`);
    fixed = fixed.replace(reDel, `</${tag}></del>`);
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
  const remainingText = stripped.replace(/<[^>]+>/g, "").replace(/\s/g, "");
  return remainingText.length === 0 && totalText.length > 0;
}

export function cleanInnerDiffTags(html: string, type: "ins" | "del"): string {
  const reOpen = new RegExp(`<${type}[^>]*?>`, "gi");
  const reClose = new RegExp(`<\\/${type}>`, "gi");
  return html.replace(reOpen, "").replace(reClose, "");
}
