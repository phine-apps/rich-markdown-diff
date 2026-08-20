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

import { findClosing } from "./domUtils";

/**
 * Performs a structural diff between two HTML tables.
 * This method aligns rows and columns to prevent content "drift" when table structure changes.
 */
export function diffTables(
  oldTableHtml: string,
  newTableHtml: string,
  execute: (old: string, newStr: string) => string,
): string {
  const oldTable = parseTable(oldTableHtml);
  const newTable = parseTable(newTableHtml);

  // 1. Align Columns by header name or index
  const colMapping = alignColumns(oldTable.headers, newTable.headers);

  // 2. Align Rows by content similarity or index
  const rowMapping = alignRows(oldTable.rows, newTable.rows);

  // 3. Generate Merged Table
  return renderMergedTable(
    oldTable,
    newTable,
    colMapping,
    rowMapping,
    execute,
  );
}

/**
 * Parses an HTML table string into a structured representation.
 */
export function parseTable(html: string) {
  const rows: {
    cells: { html: string; attrs: string; tag: string }[];
    attrs: string;
  }[] = [];
  const headers: { html: string; attrs: string }[] = [];

  const getInner = (h: string, tag: string) => {
    const startRegex = new RegExp(`<${tag}([^>]*)>`, "i");
    const endRegex = new RegExp(`</${tag}>`, "i");
    const startMatch = h.match(startRegex);
    const endMatch = h.match(endRegex);
    if (startMatch && endMatch) {
      return {
        attrs: startMatch[1],
        content: h.substring(startMatch.index! + startMatch[0].length, endMatch.index)
      };
    }
    return null;
  };

  // Extract thead
  const theadStart = html.search(/<thead/i);
  if (theadStart !== -1) {
    const theadEnd = findClosing(html, theadStart, "thead");
    if (theadEnd !== -1) {
      const theadFull = html.substring(theadStart, theadEnd);
      let trPos = 0;
      let trStartMatch;
      while ((trStartMatch = theadFull.substring(trPos).match(/<tr\b[^>]*>/i)) !== null) {
        if (!trStartMatch) {
          break;
        }

        const absoluteTrStart = trPos + trStartMatch.index!;
        const trEnd = findClosing(theadFull, absoluteTrStart, "tr");
        if (trEnd === -1) {
          trPos = absoluteTrStart + 4;
          continue;
        }

        const trFull = theadFull.substring(absoluteTrStart, trEnd);
        let cellPos = 0;
        while (true) {
          const thStartMatch = trFull.substring(cellPos).match(/<th\b[^>]*>/i);
          if (!thStartMatch) {break;}

          const absoluteThStart = cellPos + thStartMatch.index!;
          const thEnd = findClosing(trFull, absoluteThStart, "th");
          if (thEnd === -1) {
            cellPos = absoluteThStart + 4;
            continue;
          }

          const thFull = trFull.substring(absoluteThStart, thEnd);
          const info = getInner(thFull, "th");
          if (info) {
            headers.push({ html: info.content, attrs: info.attrs });
          }
          cellPos = thEnd;
        }
        trPos = trEnd;
      }
    }
  }

  // Extract tbody (support multiple tbodies)
  let searchStart = 0;
  while (true) {
    const tbodyStart = html.substring(searchStart).search(/<tbody/i);
    if (tbodyStart === -1) {
      break;
    }

    const absoluteTbodyStart = searchStart + tbodyStart;
    const tbodyEnd = findClosing(html, absoluteTbodyStart, "tbody");
    if (tbodyEnd === -1) {
      searchStart = absoluteTbodyStart + 6;
      continue;
    }

    const tbodyFull = html.substring(absoluteTbodyStart, tbodyEnd);
    let trPos = 0;
    while (true) {
      const trStartMatch = tbodyFull.substring(trPos).match(/<tr\b[^>]*>/i);
      if (!trStartMatch) {
        break;
      }

      const absoluteTrStart = trPos + trStartMatch.index!;
      const trEnd = findClosing(tbodyFull, absoluteTrStart, "tr");
      if (trEnd === -1) {
        trPos = absoluteTrStart + 4;
        continue;
      }

      const trFull = tbodyFull.substring(absoluteTrStart, trEnd);
      const trAttrs = trStartMatch[0].match(/<tr([^>]*)>/i)?.[1] || "";
      const cells: { html: string; attrs: string; tag: string }[] = [];

      // Extract cells (td/th) inside this tr
      let cellPos = 0;
      while (true) {
        const cellStartMatch = trFull.substring(cellPos).match(/<(td|th)\b[^>]*>/i);
        if (!cellStartMatch) {break;}

        const tag = cellStartMatch[1].toLowerCase();
        const absoluteCellStart = cellPos + cellStartMatch.index!;
        const cellEnd = findClosing(trFull, absoluteCellStart, tag);
        if (cellEnd === -1) {
          cellPos = absoluteCellStart + 4;
          continue;
        }

        const cellFull = trFull.substring(absoluteCellStart, cellEnd);
        const info = getInner(cellFull, tag);
        if (info) {
          cells.push({ html: info.content, attrs: info.attrs, tag });
        }
        cellPos = cellEnd;
      }

      rows.push({ cells, attrs: trAttrs });
      trPos = trEnd;
    }
    searchStart = tbodyEnd;
  }

  // Fallback: If no tbody/thead found, try to extract tr directly from table
  if (rows.length === 0 && headers.length === 0) {
    let trPos = 0;
    while (true) {
      const trStartMatch = html.substring(trPos).match(/<tr\b[^>]*>/i);
      if (!trStartMatch) {
        break;
      }

      const absoluteTrStart = trPos + trStartMatch.index!;
      const trEnd = findClosing(html, absoluteTrStart, "tr");
      if (trEnd === -1) {
        trPos = absoluteTrStart + 4;
        continue;
      }

      const trFull = html.substring(absoluteTrStart, trEnd);
      const trAttrs = trStartMatch[0].match(/<tr([^>]*)>/i)?.[1] || "";
      const cells: { html: string; attrs: string; tag: string }[] = [];

      let cellPos = 0;
      while (true) {
        const cellStartMatch = trFull.substring(cellPos).match(/<(td|th)\b[^>]*>/i);
        if (!cellStartMatch) {break;}

        const tag = cellStartMatch[1].toLowerCase();
        const absoluteCellStart = cellPos + cellStartMatch.index!;
        const cellEnd = findClosing(trFull, absoluteCellStart, tag);
        if (cellEnd === -1) {
          cellPos = absoluteCellStart + 4;
          continue;
        }

        const cellFull = trFull.substring(absoluteCellStart, cellEnd);
        const info = getInner(cellFull, tag);
        if (info) {
          cells.push({ html: info.content, attrs: info.attrs, tag });
        }
        cellPos = cellEnd;
      }

      rows.push({ cells, attrs: trAttrs });
      trPos = trEnd;
    }
  }

  const tableAttrs = html.match(/<table([^>]*)>/i)?.[1] || "";
  return { headers, rows, tableAttrs };
}

/**
 * Aligns columns between two tables based on header text or index.
 */
export function alignColumns(
  oldHeaders: any[],
  newHeaders: any[],
): { oldIdx: number | null; newIdx: number | null }[] {
  const mapping: { oldIdx: number | null; newIdx: number | null }[] = [];
  const usedNew = new Set<number>();

  oldHeaders.forEach((oldH, oldIdx) => {
    const oldText = oldH.html.replace(/<[^>]+>/g, "").trim().toLowerCase();
    let matchedIdx = -1;
    if (oldText) {
      matchedIdx = newHeaders.findIndex(
        (newH, newIdx) =>
          !usedNew.has(newIdx) &&
          newH.html.replace(/<[^>]+>/g, "").trim().toLowerCase() === oldText,
      );
    }

    if (matchedIdx !== -1) {
      usedNew.add(matchedIdx);
      mapping.push({ oldIdx, newIdx: matchedIdx });
    } else {
      mapping.push({ oldIdx, newIdx: null });
    }
  });

  newHeaders.forEach((_, newIdx) => {
    if (!usedNew.has(newIdx)) {
      mapping.push({ oldIdx: null, newIdx });
    }
  });

  return mapping.sort((a, b) => {
    const aVal = a.newIdx !== null ? a.newIdx : 1000 + (a.oldIdx ?? 0);
    const bVal = b.newIdx !== null ? b.newIdx : 1000 + (b.oldIdx ?? 0);
    return aVal - bVal;
  });
}

/**
 * Aligns rows between two tables based on identity (first column) or index.
 */
export function alignRows(
  oldRows: any[],
  newRows: any[],
): { oldIdx: number | null; newIdx: number | null }[] {
  const mapping: { oldIdx: number | null; newIdx: number | null }[] = [];
  const usedNew = new Set<number>();

  oldRows.forEach((oldR, oldIdx) => {
    // 1. Try exact identity match on first column (strongest signal)
    const oldId = oldR.cells[0]?.html.replace(/<[^>]+>/g, "").trim();
    let matchedIdx = -1;
    if (oldId) {
      matchedIdx = newRows.findIndex(
        (newR, newIdx) =>
          !usedNew.has(newIdx) &&
          newR.cells[0]?.html.replace(/<[^>]+>/g, "").trim() === oldId,
      );
    }

    // 2. If no identity match, try similarity match across all cells
    if (matchedIdx === -1) {
      let bestScore = 0;
      newRows.forEach((newR, newIdx) => {
        if (usedNew.has(newIdx)) {
          return;
        }
        let score = 0;
        const numCells = Math.min(oldR.cells.length, newR.cells.length);
        for (let i = 0; i < numCells; i++) {
          const oText = oldR.cells[i].html.replace(/<[^>]+>/g, "").trim();
          const nText = newR.cells[i].html.replace(/<[^>]+>/g, "").trim();
          if (oText && oText === nText) {
            score++;
          }
        }
        // Requirement: at least 50% of cells must match or at least 2 cells
        if (score > bestScore && (score >= numCells / 2 || score >= 2)) {
          bestScore = score;
          matchedIdx = newIdx;
        }
      });
    }

    if (matchedIdx !== -1) {
      usedNew.add(matchedIdx);
      mapping.push({ oldIdx, newIdx: matchedIdx });
    } else {
      mapping.push({ oldIdx, newIdx: null });
    }
  });

  newRows.forEach((_, newIdx) => {
    if (!usedNew.has(newIdx)) {
      mapping.push({ oldIdx: null, newIdx });
    }
  });

  return mapping.sort((a, b) => {
    const aVal = a.newIdx !== null ? a.newIdx : 1000 + (a.oldIdx ?? 0);
    const bVal = b.newIdx !== null ? b.newIdx : 1000 + (b.oldIdx ?? 0);
    return aVal - bVal;
  });
}

/**
 * Renders a merged HTML table from structured diff data.
 */
export function renderMergedTable(
  oldTable: any,
  newTable: any,
  colMapping: any[],
  rowMapping: any[],
  execute: any,
): string {
  let html = `<table${newTable.tableAttrs || oldTable.tableAttrs}>`;

  // Render Header
  html += "<thead><tr>";
  colMapping.forEach((m) => {
    const colClass =
      m.newIdx === null
        ? "diff-col-del"
        : m.oldIdx === null
          ? "diff-col-ins"
          : "";

    const oldH = m.oldIdx !== null && m.oldIdx >= 0 && m.oldIdx < oldTable.headers.length ? oldTable.headers[m.oldIdx] : undefined;
    const newH = m.newIdx !== null && m.newIdx >= 0 && m.newIdx < newTable.headers.length ? newTable.headers[m.newIdx] : undefined;

    if (oldH && newH) {
      const diff = execute(oldH.html, newH.html);
      html += `<th${appendClass(newH.attrs, colClass)}>${diff}</th>`;
    } else if (oldH) {
      html += `<th${appendClass(oldH.attrs, colClass)}><del class="diffdel">${oldH.html}</del></th>`;
    } else if (newH) {
      html += `<th${appendClass(newH.attrs, colClass)}><ins class="diffins">${newH.html}</ins></th>`;
    } else {
      html += `<th${appendClass("", colClass)}></th>`;
    }
  });
  html += "</tr></thead>";

  // Render Body
  html += "<tbody>";
  rowMapping.forEach((rm) => {
    if (rm.oldIdx !== null && rm.newIdx !== null) {
      const oldR = oldTable.rows[rm.oldIdx];
      const newR = newTable.rows[rm.newIdx];
      html += `<tr${newR.attrs}>`;
      colMapping.forEach((cm) => {
        const colClass =
          cm.newIdx === null
            ? "diff-col-del"
            : cm.oldIdx === null
              ? "diff-col-ins"
              : "";

        const oldC = cm.oldIdx !== null && cm.oldIdx >= 0 && cm.oldIdx < oldR.cells.length ? oldR.cells[cm.oldIdx] : undefined;
        const newC = cm.newIdx !== null && cm.newIdx >= 0 && cm.newIdx < newR.cells.length ? newR.cells[cm.newIdx] : undefined;

        if (oldC && newC) {
          const diff = execute(oldC.html, newC.html);
          html += `<td${appendClass(newC.attrs, colClass)}>${diff}</td>`;
        } else if (oldC) {
          html += `<td${appendClass(oldC.attrs, colClass)}><del class="diffdel">${oldC.html}</del></td>`;
        } else if (newC) {
          html += `<td${appendClass(newC.attrs, colClass)}><ins class="diffins">${newC.html}</ins></td>`;
        } else {
          html += `<td${appendClass("", colClass)}></td>`;
        }
      });
      html += "</tr>";
    } else if (rm.oldIdx !== null) {
      const oldR = oldTable.rows[rm.oldIdx];
      html += `<tr${oldR.attrs} class="diffdel">`;
      colMapping.forEach((cm) => {
        const colClass =
          cm.newIdx === null
            ? "diff-col-del"
            : cm.oldIdx === null
              ? "diff-col-ins"
              : "";
        const oldC = cm.oldIdx !== null && cm.oldIdx >= 0 && cm.oldIdx < oldR.cells.length ? oldR.cells[cm.oldIdx] : undefined;
        if (oldC) {
          html += `<td${appendClass(oldC.attrs, colClass)}><del class="diffdel">${oldC.html}</del></td>`;
        } else {
          html += `<td${appendClass("", colClass)}></td>`;
        }
      });
      html += "</tr>";
    } else {
      const newR = newTable.rows[rm.newIdx!];
      html += `<tr${newR.attrs} class="diffins">`;
      colMapping.forEach((cm) => {
        const colClass =
          cm.newIdx === null
            ? "diff-col-del"
            : cm.oldIdx === null
              ? "diff-col-ins"
              : "";
        const newC = cm.newIdx !== null && cm.newIdx >= 0 && cm.newIdx < newR.cells.length ? newR.cells[cm.newIdx] : undefined;
        if (newC) {
          html += `<td${appendClass(newC.attrs, colClass)}><ins class="diffins">${newC.html}</ins></td>`;
        } else {
          html += `<td${appendClass("", colClass)}></td>`;
        }
      });
      html += "</tr>";
    }
  });
  html += "</tbody></table>";
  return html;
}

/**
 * Appends a class to an existing attributes string.
 * Uses a single-pass scanner to safely identify top-level class attributes
 * without misidentifying class strings inside other attribute values.
 */
export function appendClass(attrs: string, className: string): string {
  if (!className) {
    return attrs;
  }

  let i = 0;
  const len = attrs.length;

  while (i < len) {
    // Skip leading whitespace
    while (i < len && /\s/.test(attrs[i])) {
      i++;
    }
    if (i >= len) {
      break;
    }

    const attrStart = i;
    // Read attribute name until '=', whitespace, or end
    while (i < len && !/[\s=>/]/.test(attrs[i])) {
      i++;
    }

    if (attrStart === i) {
      // Advance past non-attribute characters to prevent stalling
      i++;
      continue;
    }

    const attrName = attrs.substring(attrStart, i);

    // Skip whitespace before '='
    while (i < len && /\s/.test(attrs[i])) {
      i++;
    }

    if (i < len && attrs[i] === "=") {
      i++; // Skip '='
      // Skip whitespace after '='
      while (i < len && /\s/.test(attrs[i])) {
        i++;
      }

      if (i < len) {
        const quote = attrs[i];
        if (quote === '"' || quote === "'") {
          const valStart = i + 1;
          i++; // Skip opening quote
          while (i < len && attrs[i] !== quote) {
            if (attrs[i] === "\\" && i + 1 < len) {
              i += 2; // Skip escaped character inside quotes
              continue;
            }
            i++;
          }
          const valEnd = i;
          if (i < len) {
            i++; // Skip closing quote
          }

          if (attrName.toLowerCase() === "class") {
            const existingVal = attrs.substring(valStart, valEnd).trim();
            const newVal = `${className}${existingVal ? " " + existingVal : ""}`;
            return (
              attrs.substring(0, valStart) +
              newVal +
              attrs.substring(valEnd)
            );
          }
        } else {
          // Unquoted attribute value
          const valStart = i;
          while (i < len && !/\s/.test(attrs[i])) {
            i++;
          }
          const valEnd = i;
          if (attrName.toLowerCase() === "class") {
            const existingVal = attrs.substring(valStart, valEnd).trim();
            const newVal = `"${className}${existingVal ? " " + existingVal : ""}"`;
            return (
              attrs.substring(0, attrStart) +
              `class=${newVal}` +
              attrs.substring(valEnd)
            );
          }
        }
      }
    } else if (attrName.toLowerCase() === "class") {
      // Boolean class attribute without value
      return (
        attrs.substring(0, attrStart) +
        `class="${className}"` +
        attrs.substring(i)
      );
    }
  }

  // Otherwise, prepend the class attribute
  return ` class="${className}"${attrs.startsWith(" ") ? attrs : (attrs ? " " + attrs : "")}`;
}
