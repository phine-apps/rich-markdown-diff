import * as assert from "assert";
import {
  computeMermaidDiff,
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
    const diff = computeMermaidDiff(oldCode, newCode);
    assert.ok(diff.includes("style C fill:#e6ffec"), "Should style node C as inserted");
    assert.ok(diff.includes("linkStyle 1 stroke:#22863a"), "Should style edge 1 as inserted link");
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
    const diff = computeMermaidDiff(oldCode, newCode);
    assert.ok(diff.includes("C[\"Old Node\"]"), "Should include ghost node definition for C");
    assert.ok(diff.includes("style C fill:#ffeef0"), "Should style node C as deleted");
    assert.ok(diff.includes("linkStyle 1 stroke:#d73a49"), "Should style deleted link");
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
    const diff = computeMermaidDiff(oldCode, newCode);
    assert.ok(diff.includes("style A fill:#fffdef"), "Should style node A as modified");
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
    // 'myGroup' appears on the `subgraph myGroup[...]` line and must not be
    // treated as a diagram node, even though it has an explicit bracket shape.
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
    // A single line `A --> B --> C` encodes two edges: A→B and B→C.
    // The edge parser must rewind its index so the shared node B is captured
    // as both the 'to' of the first edge and the 'from' of the second.
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
    // When the Mermaid block is brand new (no previous version), all elements
    // should be highlighted green rather than returned unstyled.
    const newCode = `
      graph TD
        A["Start"] --> B
        B --> C["End"]
    `;
    const diff = computeMermaidDiff("", newCode);
    assert.ok(diff.includes("style A fill:#e6ffec"), "Node A should be styled as inserted");
    assert.ok(diff.includes("style B fill:#e6ffec"), "Node B should be styled as inserted");
    assert.ok(diff.includes("style C fill:#e6ffec"), "Node C should be styled as inserted");
    assert.ok(diff.includes("linkStyle 0 stroke:#22863a"), "Edge 0 should be styled as inserted");
    assert.ok(diff.includes("linkStyle 1 stroke:#22863a"), "Edge 1 should be styled as inserted");
  });

  it("[MERMAID-02] should style all nodes/edges as deleted when newCode is empty", () => {
    // When the Mermaid block is entirely removed, all elements from the old
    // diagram should be highlighted red with ghost definitions.
    const oldCode = `
      graph TD
        A["Start"] --> B
        B --> C["End"]
    `;
    const diff = computeMermaidDiff(oldCode, "");
    assert.ok(diff.includes("style A fill:#ffeef0"), "Node A should be styled as deleted");
    assert.ok(diff.includes("style B fill:#ffeef0"), "Node B should be styled as deleted");
    assert.ok(diff.includes("style C fill:#ffeef0"), "Node C should be styled as deleted");
    assert.ok(diff.includes("linkStyle 0 stroke:#d73a49"), "Edge 0 should be styled as deleted");
    assert.ok(diff.includes("linkStyle 1 stroke:#d73a49"), "Edge 1 should be styled as deleted");
  });
});
