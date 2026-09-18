/*
 * MIT License
 *
 * Copyright (c) 2026 Rich Markdown Diff Authors
 */

/**
 * Finds the matching closing tag for a given opening tag in an HTML string.
 * Supports nested tags of the same name, self-closing tags, quoted attribute values,
 * and HTML comments, all within strict O(N) linear time and O(1) memory.
 */
export function findClosing(
  html: string,
  start: number,
  tagName: string,
): number {
  let depth = 0;
  const tagNameLower = tagName.toLowerCase();
  const openTagPrefix = `<${tagNameLower}`;
  const closeTagPrefix = `</${tagNameLower}`;

  let i = start;
  const len = html.length;

  while (i < len) {
    // 1. Skip HTML comments: <!-- ... -->
    if (html[i] === "<" && html.startsWith("<!--", i)) {
      const endComment = html.indexOf("-->", i + 4);
      if (endComment === -1) {
        return -1;
      }
      i = endComment + 3;
      continue;
    }

    // 2. Check for closing tag: </tag ... >
    if (html[i] === "<" && html.startsWith(closeTagPrefix, i)) {
      const nextChar = html[i + closeTagPrefix.length];
      if (nextChar === ">" || /[\s/]/.test(nextChar || "")) {
        const endTag = html.indexOf(">", i + closeTagPrefix.length);
        if (endTag === -1) {
          return -1;
        }
        depth--;
        if (depth === 0) {
          return endTag + 1;
        }
        i = endTag + 1;
        continue;
      }
    }

    // 3. Check for opening tag: <tag ... > or <tag ... />
    if (html[i] === "<" && html.startsWith(openTagPrefix, i)) {
      const nextChar = html[i + openTagPrefix.length];
      if (!nextChar || /[\s/>]/.test(nextChar)) {
        // Scan the attributes of this tag, skipping quoted strings safely in O(tag length)
        let j = i + openTagPrefix.length;
        let isSelfClosing = false;

        while (j < len) {
          const c = html[j];
          if (c === ">") {
            let k = j - 1;
            while (
              k > i &&
              (html[k] === " " ||
                html[k] === "\t" ||
                html[k] === "\n" ||
                html[k] === "\r")
            ) {
              k--;
            }
            if (k > i && html[k] === "/") {
              isSelfClosing = true;
            }
            break;
          }
          if (c === '"' || c === "'") {
            const quote = c;
            j++;
            while (j < len && html[j] !== quote) {
              j++;
            }
            if (j >= len) {
              return -1;
            }
          }
          j++;
        }

        if (j >= len) {
          return -1;
        }

        const tagEnd = j + 1;

        if (isSelfClosing) {
          // If the targeted root tag itself is self-closing
          if (depth === 0) {
            return tagEnd;
          }
          // If a nested child tag is self-closing, do not increment depth
        } else {
          depth++;
        }

        i = tagEnd;
        continue;
      }
    }

    // 4. Any other HTML tag: <otherTag ... >
    // Safely skip quoted attributes to prevent <other data-tag="</target>"> from false-matching
    if (html[i] === "<" && i + 1 < len && /[a-zA-Z!/]/.test(html[i + 1])) {
      let j = i + 1;
      while (j < len && html[j] !== ">") {
        if (html[j] === '"' || html[j] === "'") {
          const quote = html[j];
          j++;
          while (j < len && html[j] !== quote) {
            j++;
          }
        }
        j++;
      }
      if (j < len) {
        i = j + 1;
        continue;
      }
    }

    i++;
  }

  return -1;
}

/**
 * Strips all HTML tags from a string iteratively to prevent incomplete multi-character sanitization vulnerabilities (CWE-116).
 * Uses a quote-aware regex that safely skips over attribute values containing '>'.
 */
export function stripHtmlTags(input: string, replacement = ""): string {
  let current = input;
  let previous: string;
  do {
    previous = current;
    current = current.replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g, replacement);
  } while (current !== previous);
  return current;
}

/**
 * Set of HTML void tags that cannot have child nodes and must not have closing tags.
 */
export const HTML_VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/**
 * Checks whether all HTML tags in an HTML fragment are properly balanced (all non-void
 * opening tags have matching closing tags in correct LIFO order, and no unexpected closing tags).
 */
export function areHtmlTagsBalanced(html: string): boolean {
  const stack: string[] = [];
  const voidTags = HTML_VOID_TAGS;

  let i = 0;
  const len = html.length;

  while (i < len) {
    if (html[i] === "<") {
      // 1. Skip comments: <!-- ... -->
      if (html.startsWith("<!--", i)) {
        const endComment = html.indexOf("-->", i + 4);
        if (endComment === -1) {
          return false;
        }
        i = endComment + 3;
        continue;
      }

      // 2. Closing tag: </tag ... >
      if (html[i + 1] === "/") {
        // End tag must start with an ASCII letter immediately after </ (no whitespace or numbers)
        if (!/[a-zA-Z]/.test(html[i + 2] || "")) {
          return false;
        }

        let j = i + 2;
        while (j < len && html[j] !== ">") {
          if (html[j] === '"' || html[j] === "'") {
            const quote = html[j];
            j++;
            while (j < len && html[j] !== quote) {
              j++;
            }
            if (j >= len) {
              return false; // Unclosed quote inside closing tag
            }
          }
          j++;
        }
        if (j >= len) {
          return false;
        }
        const tagText = html.substring(i + 2, j);
        const closeTagNameMatch = /^([a-z][a-z0-9-]*)(?=[\s]|$)/i.exec(tagText);
        if (!closeTagNameMatch) {
          return false;
        }
        const tagName = closeTagNameMatch[1].toLowerCase();
        if (stack.length === 0 || stack[stack.length - 1] !== tagName) {
          return false;
        }
        stack.pop();
        i = j + 1;
        continue;
      }

      // 3. Opening or self-closing tag: <tag ... > or <tag ... />
      if (/[a-zA-Z]/.test(html[i + 1] || "")) {
        const tagMatch = /^<([a-z][a-z0-9-]*)(?=[\s/>]|$)/i.exec(
          html.slice(i, i + 100),
        );
        if (tagMatch) {
          const tagName = tagMatch[1].toLowerCase();
          let j = i + 1 + tagMatch[1].length;
          let isSelfClosing = false;
          while (j < len) {
            const c = html[j];
            if (c === ">") {
              let k = j - 1;
              while (
                k > i &&
                (html[k] === " " ||
                  html[k] === "\t" ||
                  html[k] === "\n" ||
                  html[k] === "\r")
              ) {
                k--;
              }
              if (k > i && html[k] === "/") {
                isSelfClosing = true;
              }
              break;
            }
            if (c === '"' || c === "'") {
              const quote = c;
              j++;
              while (j < len && html[j] !== quote) {
                j++;
              }
              if (j >= len) {
                return false; // Unclosed quote inside opening tag
              }
            }
            j++;
          }
          if (j >= len) {
            return false;
          }
          if (!isSelfClosing && !voidTags.has(tagName)) {
            stack.push(tagName);
          }
          i = j + 1;
          continue;
        }
      }
    }
    i++;
  }

  return stack.length === 0;
}

