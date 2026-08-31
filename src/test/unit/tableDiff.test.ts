import * as assert from "assert";
import { parseTable } from "../../markdown/tableDiff";

describe("parseTable", () => {
  it("should parse a simple table with thead and tbody", () => {
    const html = `
      <table>
        <thead><tr><th>Name</th><th>Age</th></tr></thead>
        <tbody>
          <tr><td>Alice</td><td>30</td></tr>
          <tr><td>Bob</td><td>25</td></tr>
        </tbody>
      </table>
    `;
    const result = parseTable(html);
    assert.strictEqual(result.headers.length, 2);
    assert.strictEqual(result.headers[0].html, "Name");
    assert.strictEqual(result.headers[1].html, "Age");
    assert.strictEqual(result.rows.length, 2);
    assert.strictEqual(result.rows[0].cells.length, 2);
    assert.strictEqual(result.rows[0].cells[0].html, "Alice");
    assert.strictEqual(result.rows[1].cells[1].html, "25");
  });

  it("should parse a table without thead/tbody (fallback)", () => {
    const html = `
      <table>
        <tr><td>X</td><td>Y</td></tr>
        <tr><td>1</td><td>2</td></tr>
      </table>
    `;
    const result = parseTable(html);
    assert.strictEqual(result.headers.length, 0);
    assert.strictEqual(result.rows.length, 2);
    assert.strictEqual(result.rows[0].cells[0].html, "X");
  });

  it("should handle multiple tbody sections", () => {
    const html = `
      <table>
        <tbody><tr><td>A</td></tr></tbody>
        <tbody><tr><td>B</td></tr></tbody>
      </table>
    `;
    const result = parseTable(html);
    assert.strictEqual(result.rows.length, 2);
    assert.strictEqual(result.rows[0].cells[0].html, "A");
    assert.strictEqual(result.rows[1].cells[0].html, "B");
  });

  it("should handle mixed td/th cells in tbody rows", () => {
    const html = `
      <table>
        <tbody>
          <tr><th>Header</th><td>Data</td></tr>
        </tbody>
      </table>
    `;
    const result = parseTable(html);
    assert.strictEqual(result.rows.length, 1);
    assert.strictEqual(result.rows[0].cells.length, 2);
    assert.strictEqual(result.rows[0].cells[0].tag, "th");
    assert.strictEqual(result.rows[0].cells[1].tag, "td");
  });

  it("should not hang on large tables (performance regression)", () => {
    // Generate a table with 200 rows × 5 columns
    let html = "<table><tbody>";
    for (let r = 0; r < 200; r++) {
      html += "<tr>";
      for (let c = 0; c < 5; c++) {
        html += `<td>R${r}C${c}</td>`;
      }
      html += "</tr>";
    }
    html += "</tbody></table>";

    const start = Date.now();
    const result = parseTable(html);
    const elapsed = Date.now() - start;
    assert.strictEqual(result.rows.length, 200);
    assert.strictEqual(result.rows[0].cells.length, 5);
    // Must complete in under 2 seconds; O(N²) would be much slower at scale
    assert.ok(elapsed < 2000, `Took ${elapsed}ms — possible O(N²) regression`);
  });

  it("should handle empty table gracefully", () => {
    const html = "<table></table>";
    const result = parseTable(html);
    assert.strictEqual(result.headers.length, 0);
    assert.strictEqual(result.rows.length, 0);
  });

  it("should preserve table attributes", () => {
    const html = `<table class="my-table" id="t1"><tbody><tr><td>OK</td></tr></tbody></table>`;
    const result = parseTable(html);
    assert.ok(result.tableAttrs.includes("my-table"));
  });
});
