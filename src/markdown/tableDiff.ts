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

  // Extract headers from thead
  const theadMatch = html.match(/<thead>([\s\S]*?)<\/thead>/i);
  if (theadMatch) {
    const trMatches = theadMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
    trMatches.forEach((trHtml) => {
      const thMatches = trHtml.match(/<th[^>]*>([\s\S]*?)<\/th>/gi) || [];
      thMatches.forEach((thHtml) => {
        const inner = thHtml.replace(/<th([^>]*)>([\s\S]*?)<\/th>/i, "$2");
        const attrs = thHtml.replace(/<th([^>]*)>([\s\S]*?)<\/th>/i, "$1");
        headers.push({ html: inner, attrs });
      });
    });
  }

  // Extract rows from tbody
  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  if (tbodyMatch) {
    const trMatches = tbodyMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
    trMatches.forEach((trHtml) => {
      const trAttrs = trHtml.replace(/<tr([^>]*)>[\s\S]*?<\/tr>/i, "$1");
      const cells: { html: string; attrs: string; tag: string }[] = [];
      const tdMatches = trHtml.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
      tdMatches.forEach((tdHtml) => {
        const inner = tdHtml.replace(/<td([^>]*)>([\s\S]*?)<\/td>/i, "$2");
        const attrs = tdHtml.replace(/<td([^>]*)>([\s\S]*?)<\/td>/i, "$1");
        cells.push({ html: inner, attrs, tag: "td" });
      });
      rows.push({ cells, attrs: trAttrs });
    });
  }

  const tableAttrs =
    html.match(/<table([^>]*)>/i)?.[1] || "";
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
    const oldId = oldR.cells[0]?.html.replace(/<[^>]+>/g, "").trim();
    let matchedIdx = -1;
    if (oldId) {
      matchedIdx = newRows.findIndex(
        (newR, newIdx) =>
          !usedNew.has(newIdx) &&
          newR.cells[0]?.html.replace(/<[^>]+>/g, "").trim() === oldId,
      );
    }

    if (matchedIdx !== -1) {
      usedNew.add(matchedIdx);
      mapping.push({ oldIdx, newIdx: matchedIdx });
    } else {
      // Fallback to index if content is somewhat similar or just keep it as deleted
      // For now, simple identity match or unmatched.
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
