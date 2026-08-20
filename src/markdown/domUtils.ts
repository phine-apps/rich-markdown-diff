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
            if (j > i && html[j - 1] === "/") {
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
