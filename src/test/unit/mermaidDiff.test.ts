import * as assert from "assert";
import {
  computeMermaidDiff,
  computeMermaidDiffPair,
  parseMermaidNodes,
  parseMermaidEdges,
} from "../../markdown/mermaidDiff";

describe("Mermaid Semantic Diff", () => {
  it("should parse nodes correctly", () => {
    const code = `
      graph TD
        A["Start"] --> B(Process)
        C((End))
    `;
    const nodes = parseMermaidNodes(code);
    assert.strictEqual(nodes.size, 3);
    assert.strictEqual(nodes.get("A")?.label, "Start");
    assert.strictEqual(nodes.get("B")?.label, "Process");
    assert.strictEqual(nodes.get("C")?.label, "End");
  });

  it("should parse edges correctly", () => {
    const code = `
      graph TD
        A --> B
        B --> C
    `;
    const edges = parseMermaidEdges(code);
    assert.strictEqual(edges.length, 2);
    assert.strictEqual(edges[0].from, "A");
    assert.strictEqual(edges[0].to, "B");
    assert.strictEqual(edges[1].from, "B");
    assert.strictEqual(edges[1].to, "C");
  });

  it("should inject inserted node styles when node is added", () => {
    const oldCode = `
      graph TD
        A --> B
    `;
    const newCode = `
      graph TD
        A --> B
        B --> C["New Node"]
    `;
    const { newMermaid } = computeMermaidDiffPair(oldCode, newCode);
    assert.ok(newMermaid.includes("style C fill:#132a1c"), "Should style node C as inserted");
    assert.ok(newMermaid.includes("linkStyle 1 stroke:#22c55e"), "Should style edge 1 as inserted link");
  });

  it("should inject ghost definition and deleted node style when node is removed", () => {
    const oldCode = `
      graph TD
        A --> B
        B --> C["Old Node"]
    `;
    const newCode = `
      graph TD
        A --> B
    `;
    const { oldMermaid } = computeMermaidDiffPair(oldCode, newCode);
    assert.ok(oldMermaid.includes("style C fill:#2c1214"), "Should style node C as deleted in oldMermaid");
    assert.ok(oldMermaid.includes("linkStyle 1 stroke:#ef4444"), "Should style deleted link in oldMermaid");
  });

  it("should highlight modified node when node label changes", () => {
    const oldCode = `
      graph TD
        A["Original Step"] --> B
    `;
    const newCode = `
      graph TD
        A["Updated Step"] --> B
    `;
    const { oldMermaid, newMermaid } = computeMermaidDiffPair(oldCode, newCode);
    assert.ok(oldMermaid.includes("style A fill:#2e2305"), "Should style node A as modified in oldMermaid");
    assert.ok(newMermaid.includes("style A fill:#2e2305"), "Should style node A as modified in newMermaid");
  });

  it("should not treat edge labels as node identifiers", () => {
    const code = `
      graph TD
        A --> B
        B -- Yes --> C
        B -- No --> D
    `;
    const nodes = parseMermaidNodes(code);
    assert.strictEqual(nodes.size, 4, "Should only detect A, B, C, D as nodes");
    assert.ok(nodes.has("A"));
    assert.ok(nodes.has("B"));
    assert.ok(nodes.has("C"));
    assert.ok(nodes.has("D"));
    assert.ok(!nodes.has("Yes"), "Yes should not be treated as a node");
    assert.ok(!nodes.has("No"), "No should not be treated as a node");
  });

  it("should skip style injection for non-flowchart diagrams (e.g. sequenceDiagram)", () => {
    const oldCode = `
      sequenceDiagram
        Alice->>Bob: Hello Bob
    `;
    const newCode = `
      sequenceDiagram
        Alice->>Bob: Hello Bob
        Bob-->>Alice: Hi Alice
    `;
    const diff = computeMermaidDiff(oldCode, newCode);
    assert.strictEqual(diff.trim(), newCode.trim(), "Should return unmodified new code for sequenceDiagram");
  });

  // --- MERMAID-01 regression tests ---

  it("[MERMAID-01] should NOT register subgraph group name as a node", () => {
    const code = `
      graph TD
        subgraph myGroup[My Group]
          A --> B
        end
    `;
    const nodes = parseMermaidNodes(code);
    assert.ok(!nodes.has("myGroup"), "subgraph group ID must not be registered as a node");
    assert.ok(nodes.has("A"), "A should be registered as a node");
    assert.ok(nodes.has("B"), "B should be registered as a node");
  });

  it("[MERMAID-01] should parse all edges in chain notation (A --> B --> C)", () => {
    const code = `
      graph LR
        A --> B --> C
    `;
    const edges = parseMermaidEdges(code);
    assert.strictEqual(edges.length, 2, "Chain A-->B-->C should produce 2 edges");
    assert.ok(
      edges.some((e) => e.from === "A" && e.to === "B"),
      "Edge A→B must be present"
    );
    assert.ok(
      edges.some((e) => e.from === "B" && e.to === "C"),
      "Edge B→C must be present"
    );
  });

  // --- MERMAID-02 regression tests ---

  it("[MERMAID-02] should style all nodes/edges as inserted when oldCode is empty", () => {
    const newCode = `
      graph TD
        A["Start"] --> B
        B --> C["End"]
    `;
    const { newMermaid } = computeMermaidDiffPair("", newCode);
    assert.ok(newMermaid.includes("style A fill:#132a1c"), "Node A should be styled as inserted");
    assert.ok(newMermaid.includes("style B fill:#132a1c"), "Node B should be styled as inserted");
    assert.ok(newMermaid.includes("style C fill:#132a1c"), "Node C should be styled as inserted");
    assert.ok(newMermaid.includes("linkStyle 0 stroke:#22c55e"), "Edge 0 should be styled as inserted");
    assert.ok(newMermaid.includes("linkStyle 1 stroke:#22c55e"), "Edge 1 should be styled as inserted");
  });

  it("[MERMAID-02] should style all nodes/edges as deleted when newCode is empty", () => {
    const oldCode = `
      graph TD
        A["Start"] --> B
        B --> C["End"]
    `;
    const { oldMermaid } = computeMermaidDiffPair(oldCode, "");
    assert.ok(oldMermaid.includes("style A fill:#2c1214"), "Node A should be styled as deleted");
    assert.ok(oldMermaid.includes("style B fill:#2c1214"), "Node B should be styled as deleted");
    assert.ok(oldMermaid.includes("style C fill:#2c1214"), "Node C should be styled as deleted");
    assert.ok(oldMermaid.includes("linkStyle 0 stroke:#ef4444"), "Edge 0 should be styled as deleted");
    assert.ok(oldMermaid.includes("linkStyle 1 stroke:#ef4444"), "Edge 1 should be styled as deleted");
  });

  // --- MERMAID-03 regression tests ---

  it("[MERMAID-03] should not consume arrow hyphens as part of node IDs (A-->B;)", () => {
    const code = `
      graph TD;
        A-->B;
        B-->C;
        C-->D;
    `;
    const nodes = parseMermaidNodes(code);
    assert.strictEqual(nodes.size, 4, "Should detect exactly 4 nodes (A, B, C, D)");
    assert.ok(nodes.has("A"), "Node A must be present");
    assert.ok(nodes.has("B"), "Node B must be present");
    assert.ok(nodes.has("C"), "Node C must be present");
    assert.ok(nodes.has("D"), "Node D must be present");
    assert.ok(!nodes.has("A--"), "A-- must NOT be recognized as a node");
    assert.ok(!nodes.has("B--"), "B-- must NOT be recognized as a node");
    assert.ok(!nodes.has("C--"), "C-- must NOT be recognized as a node");
  });

  it("[MERMAID-03] should correctly compute diff between compact arrow diagrams and modified diagrams", () => {
    const oldCode = `
      graph TD;
        A-->B;
        B-->C;
        C-->D;
    `;
    const newCode = `
      graph TD
        A[Start] --> B{Decision}
        B -- Yes --> C[Process One]
        B -- No --> D[Process Two]
        C --> E[Branch A]
        C --> F[Branch B]
        E --> H[End]
        F --> H
        G --> H
    `;
    const { oldMermaid, newMermaid } = computeMermaidDiffPair(oldCode, newCode);
    assert.ok(!newMermaid.includes("A--"), "Should not include bogus A-- node");
    assert.ok(newMermaid.includes("style E fill:#132a1c"), "Should style added node E as inserted");
    assert.ok(newMermaid.includes("style A fill:#2e2305"), "Should style modified node A as modified in newMermaid");
    assert.ok(oldMermaid.includes("style A fill:#2e2305"), "Should style modified node A as modified in oldMermaid");
  });
});
