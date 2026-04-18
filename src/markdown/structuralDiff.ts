import * as htmldiff from "htmldiff-js";
import * as crypto from "crypto";
import { diffTables } from "./tableDiff";

/**
 * Main entrance for computing granular HTML diffs.
 */
export function diffHtmlFragments(
  oldHtml: string,
  newHtml: string,
  execute: (oldHtml: string, newHtml: string) => string,
): string {
  const { html: oldHtmlTokenized, tokens: tokens1 } =
    replaceComplexBlocksWithTokens(oldHtml, {
      tokenizeListContainers: false,
      tokenizeCodeBlocks: false,
    });
  const { html: newHtmlTokenized, tokens: tokens2 } =
    replaceComplexBlocksWithTokens(newHtml, {
      tokenizeListContainers: false,
      tokenizeCodeBlocks: false,
    });
  const { html: oldHtmlChecked, tokens: tokens1Checked } =
    replaceCheckboxesWithTokens(oldHtmlTokenized);
  const { html: newHtmlChecked, tokens: tokens2Checked } =
    replaceCheckboxesWithTokens(newHtmlTokenized);

  const allTokens = {
    ...tokens1,
    ...tokens2,
    ...tokens1Checked,
    ...tokens2Checked,
  };

  let diffHtml = execute(oldHtmlChecked, newHtmlChecked);
  diffHtml = fixInvalidNesting(diffHtml);
  diffHtml = normalizeListContainerChanges(diffHtml);
  diffHtml = restoreComplexTokens(diffHtml, allTokens);
  diffHtml = cleanupCheckboxArtifacts(diffHtml);
  return diffHtml;
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
export function applyStructuralDiffPipeline(html: string): string {
  let result = html;
  result = refineBlockDiffs(result);
  result = consolidateBlockDiffs(result);
  result = splitMixedBlockInsertions(result);
  result = wrapHeadingPrefixes(result);
  result = extractSharedReparentedLists(result);
  result = markGhostListItems(result);
  result = fixInvalidNesting(result);
  result = normalizeListContainerChanges(result);
  return result;
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

    if (html.startsWith("<li", i)) {
      const potentialStart = i;
      const tagEnd = html.indexOf(">", i);
      if (tagEnd > -1) {
        const tag = html.substring(potentialStart, tagEnd + 1);
        if (
          tag.includes('class="footnote-item"') ||
          tag.includes("class='footnote-item'")
        ) {
          const end = findClosing(html, i, "li");
          if (end > -1) {
            const content = html.substring(potentialStart, end);
            const token = createToken(content, "FOOTNOTE", tokens);
            result += token;
            i = end;
            continue;
          }
        }
      }
    }
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

    if (options.tokenizeListContainers !== false && html[i] === "<") {
      const listMatch = html.substring(i).match(/^<(ol|ul|dl|table)(\s[^>]*)?>/i);
      if (listMatch) {
        const tagName = listMatch[1].toLowerCase();
        const start = i;
        const end = findClosing(html, i, tagName);
        if (end > -1) {
          const content = html.substring(start, end);
          const prefix = tagName === "table" ? "TABLE" : `LIST_${tagName.toUpperCase()}`;
          const token = createToken(
            content,
            prefix,
            tokens,
          );
          result += token;
          i = end;
          continue;
        }
      }
    }

    if (html[i] === "<") {
      const headingMatch = html.substring(i).match(/^<(h[1-6])(\s[^>]*)?>/);
      if (headingMatch) {
        const tagName = headingMatch[1];
        const start = i;
        const end = findClosing(html, i, tagName);
        if (end > -1) {
          const content = html.substring(start, end);
          const token = createToken(content, "HEADING", tokens);
          result += token;
          i = end;
          continue;
        }
      }
    }

    result += html[i];
    i++;
  }
  return { html: result, tokens };
}

export function findClosing(html: string, start: number, tagName: string): number {
  let depth = 0;
  const openTag = `<${tagName}`;
  const closeTag = `</${tagName}>`;

  for (let i = start; i < html.length; i++) {
    if (html.startsWith(openTag, i)) {
      depth++;
    } else if (html.startsWith(closeTag, i)) {
      depth--;
      if (depth === 0) {
        return i + closeTag.length;
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
  const hashContent = content.replace(/\s?data-line="[^"]*"/g, "");
  const hash = crypto
    .createHash("sha256")
    .update(hashContent)
    .digest("hex")
    .substring(0, 12);
  const token = `TOKEN_${prefix}_${hash}`;
  tokens[token] = content;
  return token;
}

export function restoreComplexTokens(
  html: string,
  tokens: Record<string, string>,
): string {
  let restored = html;
  Object.keys(tokens).forEach((token) => {
    restored = restored.replace(new RegExp(token, "g"), tokens[token]);
  });
  return restored;
}

/**
 * Refinement and Optimization logic.
 */
export function refineBlockDiffs(html: string): string {
  const execute =
    (htmldiff as any).execute || (htmldiff as any).default?.execute || htmldiff;
  if (typeof execute !== "function") {
    return html;
  }

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

      return diffHtmlFragments(
        `<${oldTag}${oldAttrs}>${oldContent}</${oldTag}>`,
        `<${newTag}${newAttrs}>${newContent}</${newTag}>`,
        execute,
      );
    },
  );

  const footnoteBundleRegex =
    /<del[^>]*>\s*((?:<li[^>]*class=["']footnote-item["'][^>]*>[\s\S]*?<\/li>\s*)+)<\/del>\s*<ins[^>]*>\s*((?:<li[^>]*class=["']footnote-item["'][^>]*>[\s\S]*?<\/li>\s*)+)<\/ins>/gi;
  const footnoteItemRegex =
    /<li[^>]*class=["']footnote-item["'][^>]*>[\s\S]*?<\/li>/gi;
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
    /<del[^>]*>\s*<(h[1-6])([^>]*)>([\s\S]*?)<\/\1>\s*<\/del>\s*<ins[^>]*>\s*<(h[1-6])([^>]*)>([\s\S]*?)<\/\4>\s*<\/ins>/gi;

  resultHtml = resultHtml.replace(
    headingRegex,
    (match, oldTag, oldAttrs, oldContent, newTag, newAttrs, newContent) => {
      if (oldTag.toLowerCase() !== newTag.toLowerCase()) {
        return match;
      }
      if (/<\/?h[1-6][\s>]/i.test(newContent)) {
        return match;
      }
      const innerDiff = execute(oldContent, newContent);
      return `<${newTag}${newAttrs}>${innerDiff}</${newTag}>`;
    },
  );

  const preRegex =
    /(<del[^>]*>\s*(<pre[^>]*>[\s\S]*?<\/pre>)\s*<\/del>)\s*(<ins[^>]*>\s*(<pre[^>]*>[\s\S]*?<\/pre>)\s*<\/ins>)/gi;

  resultHtml = resultHtml.replace(
    preRegex,
    (match, delBlock, oldInner, insBlock, newInner) => {
      return diffHtmlFragments(oldInner, newInner, execute);
    },
  );

  const blockquoteRegex =
    /(<del[^>]*>\s*(<blockquote>[\s\S]*?<\/blockquote>)\s*<\/del>)\s*(<ins[^>]*>\s*(<blockquote>[\s\S]*?<\/blockquote>)\s*<\/ins>)/gi;

  resultHtml = resultHtml.replace(
    blockquoteRegex,
    (match, delBlock, oldInner, insBlock, newInner) => {
      return diffHtmlFragments(oldInner, newInner, execute);
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

  return resultHtml;
}

export function consolidateBlockDiffs(html: string): string {
  const blocks = [
    "table", "ul", "ol", "dl", "blockquote", "div", "h1", "h2", "h3", "h4", "h5", "h6", "section", "svg", "pre", "hr",
  ];
  let result = html;
  const blockTags = "table|ul|ol|dl|blockquote|div|h1|h2|h3|h4|h5|h6|section|svg|pre";
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
  return html.replace(/ data-line="\d+"/g, "");
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
      const parts = inner.split(
        /(?=<(?:h[1-6]|p|ul|ol|dl|blockquote|pre|table|hr)[\s>/])|(?<=<\/h[1-6]>)\s*(?=\S)/i,
      );
      if (parts.length <= 1) {
        return match;
      }
      return parts
        .map((part) => {
          const trimmed = part.trim();
          if (!trimmed) {
            return "";
          }
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
  return html.replace(
    /<li([^>]*)>([\s\S]*?)<\/li>/gi,
    (match, attrs: string, content: string) => {
      if (/<li\b/i.test(content)) {
        return match;
      }
      const stripInline = (s: string) =>
        s.replace(/<\/?(strong|em|b|i|s|span|a)\b[^>]*>/gi, "").trim();
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
      /(?:<del[^>]*>\s*<\/del>\s*)?<del[^>]*class="[^"]*diff-block[^"]*"[^>]*>\s*(<(ul|ol|dl)[^>]*>[\s\S]*?<\/\2>)\s*<\/del>(?:\s*<del[^>]*>\s*<\/del>)?/gi;
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
    /<ins([^>]*)>\s*(<(ol|ul|dl)[^>]*>\s*<li[\s\S]*?<\/li>\s*<\/\3>)\s*(<(ul|ol|dl)[^>]*>[\s\S]*?<\/\5>)\s*<\/ins>/gi;

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
