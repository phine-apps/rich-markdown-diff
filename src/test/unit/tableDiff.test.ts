import * as assert from "assert";
import { diffTables, parseTable } from "../../markdown/tableDiff";

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

  it("should not truncate cells containing nested tables", () => {
    const html = "<table><tbody><tr><td>Before <table><tr><td>Nested</td></tr></table> After</td></tr></tbody></table>";
    const result = parseTable(html);
    assert.strictEqual(result.rows.length, 1);
    assert.strictEqual(result.rows[0].cells.length, 1);
    assert.strictEqual(result.rows[0].cells[0].html, "Before <table><tr><td>Nested</td></tr></table> After");
  });

  it("should handle fake closing tags in attribute values", () => {
    const html = `<table><thead><tr><th title="</th>">Real Header</th></tr></thead><tbody><tr><td data-info="</td>">Real Data</td></tr></tbody></table>`;
    const result = parseTable(html);
    assert.strictEqual(result.headers.length, 1);
    assert.strictEqual(result.headers[0].html, "Real Header");
    assert.strictEqual(result.rows.length, 1);
    assert.strictEqual(result.rows[0].cells[0].html, "Real Data");
  });

  it("should parse tfoot rows and td cells inside thead (M-5)", () => {
    const html = `
      <table>
        <thead><tr><td>Col A</td><td>Col B</td></tr></thead>
        <tbody><tr><td>1</td><td>2</td></tr></tbody>
        <tfoot><tr><td>Total</td><td>3</td></tr></tfoot>
      </table>
    `;
    const parsed = parseTable(html);
    assert.strictEqual(parsed.headers.length, 2);
    assert.strictEqual(parsed.headers[0].html, "Col A");
    assert.strictEqual(parsed.footerRows.length, 1);
    assert.strictEqual(parsed.footerRows[0].cells[0].html, "Total");

    const diff = diffTables(
      html,
      html.replace("<td>3</td>", "<td>4</td>"),
      (a, b) => (a === b ? a : `<del>${a}</del><ins>${b}</ins>`),
    );
    assert.ok(diff.includes("<tfoot>"), "Diffed table should preserve <tfoot>");
    assert.ok(diff.includes("<del>3</del><ins>4</ins>"), "Diffed table should diff tfoot cells");
  });

  it("should append diffdel/diffins classes on tr without duplicating class attribute (M-5)", () => {
    const oldTable = `<table><tbody><tr class="row-old"><td>Removed</td></tr><tr><td>Same</td></tr></tbody></table>`;
    const newTable = `<table><tbody><tr><td>Same</td></tr><tr class="row-new"><td>Added</td></tr></tbody></table>`;
    const diff = diffTables(oldTable, newTable, (a, b) => a || b);
    assert.ok(diff.includes('class="diffdel row-old"') || diff.includes('class="row-old diffdel"'), `Expected merged class on deleted tr, got: ${diff}`);
    assert.ok(diff.includes('class="diffins row-new"') || diff.includes('class="row-new diffins"'), `Expected merged class on inserted tr, got: ${diff}`);
  });

  it("should keep deleted rows after all remaining rows even when table has > 1000 rows (M-5)", () => {
    const makeTable = (count: number, extraOld?: boolean) => {
      const rows: string[] = [];
      if (extraOld) {
        rows.push("<tr><td>deleted-row</td></tr>");
      }
      for (let i = 0; i < count; i++) {
        rows.push(`<tr><td>r-${i}</td></tr>`);
      }
      return `<table><tbody>${rows.join("")}</tbody></table>`;
    };
    const diff = diffTables(makeTable(1005, true), makeTable(1005, false), (a, b) => a || b);
    const deletedIdx = diff.indexOf("deleted-row");
    const lastRowIdx = diff.indexOf("r-1004");
    assert.ok(deletedIdx > lastRowIdx, "Deleted row must not be sorted before row 1004");
  });
});

