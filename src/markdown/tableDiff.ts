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
  const theadEnd = html.search(/<\/thead>/i);
  if (theadStart !== -1 && theadEnd !== -1) {
    const theadContent = html.substring(theadStart, theadEnd + 8);
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    while ((trMatch = trRegex.exec(theadContent)) !== null) {
      const thRegex = /<th[^>]*>([\s\S]*?)<\/th>/gi;
      let thMatch;
      while ((thMatch = thRegex.exec(trMatch[1])) !== null) {
        const info = getInner(thMatch[0], "th");
        if (info) {
          headers.push({ html: info.content, attrs: info.attrs });
        }
      }
    }
  }

  // Extract tbody (support multiple tbodies)
  const tbodyRegex = /<tbody[^>]*>([\s\S]*?)<\/tbody>/gi;
  let tbodyMatch;
  while ((tbodyMatch = tbodyRegex.exec(html)) !== null) {
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    while ((trMatch = trRegex.exec(tbodyMatch[1])) !== null) {
      const trAttrs = trMatch[0].match(/<tr([^>]*)>/i)?.[1] || "";
      const cells: { html: string; attrs: string; tag: string }[] = [];
      const tdRegex = /<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi;
      let tdMatch;
      while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
        const tag = tdMatch[1].toLowerCase();
        const info = getInner(tdMatch[0], tag);
        if (info) {
          cells.push({ html: info.content, attrs: info.attrs, tag });
        }
      }
      rows.push({ cells, attrs: trAttrs });
    }
  }

  // Fallback: If no tbody/thead found, try to extract tr directly from table
  if (rows.length === 0 && headers.length === 0) {
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    while ((trMatch = trRegex.exec(html)) !== null) {
      const trAttrs = trMatch[0].match(/<tr([^>]*)>/i)?.[1] || "";
      const cells: { html: string; attrs: string; tag: string }[] = [];
      const tdRegex = /<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi;
      let tdMatch;
      while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
        const tag = tdMatch[1].toLowerCase();
        const info = getInner(tdMatch[0], tag);
        if (info) {
          cells.push({ html: info.content, attrs: info.attrs, tag });
        }
      }
      rows.push({ cells, attrs: trAttrs });
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
    const aVal = a.newIdx !== null ? a.newIdx : 1000 + (a.oldIdx || 0);
    const bVal = b.newIdx !== null ? b.newIdx : 1000 + (b.oldIdx || 0);
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

  return mapping.sort((a, b) => (a.newIdx ?? 1000) - (b.newIdx ?? 1000));
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

    if (m.oldIdx !== null && m.newIdx !== null) {
      const oldH = oldTable.headers[m.oldIdx];
      const newH = newTable.headers[m.newIdx];
      const diff = execute(oldH.html, newH.html);
      html += `<th${appendClass(newH.attrs, colClass)}>${diff}</th>`;
    } else if (m.oldIdx !== null) {
      const oldH = oldTable.headers[m.oldIdx];
      html += `<th${appendClass(oldH.attrs, colClass)}><del class="diffdel">${oldH.html}</del></th>`;
    } else {
      const newH = newTable.headers[m.newIdx!];
      html += `<th${appendClass(newH.attrs, colClass)}><ins class="diffins">${newH.html}</ins></th>`;
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

        if (cm.oldIdx !== null && cm.newIdx !== null) {
          const oldC = oldR.cells[cm.oldIdx];
          const newC = newR.cells[cm.newIdx];
          const diff = execute(oldC.html, newC.html);
          html += `<td${appendClass(newC.attrs, colClass)}>${diff}</td>`;
        } else if (cm.oldIdx !== null) {
          const oldC = oldR.cells[cm.oldIdx];
          html += `<td${appendClass(oldC.attrs, colClass)}><del class="diffdel">${oldC.html}</del></td>`;
        } else {
          const newC = newR.cells[cm.newIdx!];
          html += `<td${appendClass(newC.attrs, colClass)}><ins class="diffins">${newC.html}</ins></td>`;
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
        if (cm.oldIdx !== null) {
          const oldC = oldR.cells[cm.oldIdx];
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
        if (cm.newIdx !== null) {
          const newC = newR.cells[cm.newIdx];
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
 */
export function appendClass(attrs: string, className: string): string {
  if (!className) {
    return attrs;
  }
  if (attrs.includes('class="')) {
    return attrs.replace('class="', `class="${className} `);
  } else {
    return ` class="${className}"${attrs}`;
  }
}
