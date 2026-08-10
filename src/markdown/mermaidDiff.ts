/*
 * MIT License
 *
 * Copyright (c) 2026 Rich Markdown Diff Authors
 */

export interface MermaidDiffOptions {
  insertedColor?: string;
  deletedColor?: string;
}

export interface MermaidNode {
  id: string;
  label?: string;
  raw: string;
}

export interface MermaidEdge {
  from: string;
  to: string;
  label?: string;
  raw: string;
}

/**
 * Checks if the given Mermaid code is a Flowchart / Graph diagram.
 */
export function isFlowchartMermaid(code: string): boolean {
  const lines = code.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("%%")) {
      continue;
    }
    return /^(?:graph|flowchart)\b/i.test(trimmed);
  }
  return false;
}

/**
 * Parses edge connections from a Flowchart / Graph Mermaid code block.
 */
export function parseMermaidEdges(code: string): MermaidEdge[] {
  const edges: MermaidEdge[] = [];
  const lines = code.split(/\r?\n/);

  // Match arrows:
  // 1. A -->|label| B
  // 2. A -- label --> B or A -- "label" --> B
  // 3. A --> B or A --- B or A ==> B or A -.- B
  // The optional shape group (?:[(\[{](?:[^)\]}>]|"[^"]*")*[)\]}>])? after the node ID
  // allows shaped nodes like A["Start"] --> B to be captured correctly.
  const SHAPE_GROUP = `(?:(?:\\(\\(|\\[\\[|[([{>])(?:[^)\\]}>]|"[^"]*")*(?:\\)\\)|\\]\\]|[)\\]}>]))?`;
  const edgeRegex = new RegExp(
    `\\b([a-zA-Z0-9_-]+)${SHAPE_GROUP}\\s*` +
    `(?:(?:---|-->|==>|-\\.-)\\s*(?:\\|([^|]+)\\|)?\\s*` +
    `|--\\s*(?:["']([^"']+)["']|([a-zA-Z0-9_\\s]+))\\s*-->\\s*)` +
    `([a-zA-Z0-9_-]+)`,
    "g"
  );

  for (const line of lines) {
    const trimmed = line.trim();
    // [MERMAID-01] Skip directive lines and subgraph/end keywords to avoid false edge matches
    if (
      !trimmed ||
      trimmed.startsWith("%%") ||
      trimmed.startsWith("style") ||
      trimmed.startsWith("linkStyle") ||
      trimmed.startsWith("subgraph") ||
      trimmed === "end"
    ) {
      continue;
    }

    // Reset lastIndex explicitly at the start of each line.
    // The chain-notation rewind (below) adjusts lastIndex mid-line intentionally,
    // but it must not bleed into the next line's processing.
    edgeRegex.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = edgeRegex.exec(trimmed)) !== null) {
      const from = match[1];
      const label = match[2] || match[3] || match[4];
      const to = match[5];
      if (from && to && !["graph", "flowchart", "subgraph", "end"].includes(from)) {
        edges.push({ from, to, label: label ? label.trim() : undefined, raw: match[0] });
        // [MERMAID-01] Rewind lastIndex to allow the 'to' node to serve as the 'from' of the
        // next edge in chain notation (e.g. A --> B --> C produces both A→B and B→C).
        // This is safe because the rewound position is always ahead of match.index.
        edgeRegex.lastIndex = match.index + match[0].length - to.length;
      }
    }
  }

  return edges;
}

/**
 * Parses node IDs, labels, and raw node strings from a Flowchart / Graph Mermaid code block.
 */
export function parseMermaidNodes(code: string): Map<string, MermaidNode> {
  const nodes = new Map<string, MermaidNode>();
  const lines = code.split(/\r?\n/);
  
  const edges = parseMermaidEdges(code);
  const edgeLabelWords = new Set<string>();
  for (const edge of edges) {
    if (edge.label) {
      edge.label.split(/\s+/).forEach((w) => edgeLabelWords.add(w));
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();
    // [MERMAID-01] Skip directive lines. Crucially, skip `subgraph myGroup[Label]` lines
    // to prevent the group name from being mistaken for a node definition.
    if (
      !trimmed ||
      trimmed.startsWith("%%") ||
      trimmed.startsWith("graph") ||
      trimmed.startsWith("flowchart") ||
      trimmed.startsWith("style") ||
      trimmed.startsWith("linkStyle") ||
      trimmed.startsWith("classDef") ||
      trimmed.startsWith("class ") ||
      trimmed.startsWith("subgraph") ||
      trimmed === "end"
    ) {
      continue;
    }

    const nodeRegex = /\b([a-zA-Z0-9_-]+)(?:\(\((?:["']([^"']+)["']|([^\)]+))\)\)|\[\[(?:["']([^"']+)["']|([^\]]+))\]\]|\[(?:["']([^"']+)["']|([^\]]+))\]|\((?:["']([^"']+)["']|([^\)]+))\)|\{(?:["']([^"']+)["']|([^\}]+))\}|>([^\\]]+)\])?/g;
    
    let match: RegExpExecArray | null;
    while ((match = nodeRegex.exec(trimmed)) !== null) {
      const id = match[1];
      if (["graph", "flowchart", "subgraph", "end", "style", "linkStyle", "classDef", "class", "TD", "LR", "BT", "RL", "TB"].includes(id)) {
        continue;
      }
      
      const hasExplicitShape = Boolean(match[2] || match[3] || match[4] || match[5] || match[6] || match[7] || match[8] || match[9] || match[10] || match[11] || match[12]);

      if (!hasExplicitShape && edgeLabelWords.has(id)) {
        continue;
      }

      const label = match[2] || match[3] || match[4] || match[5] || match[6] || match[7] || match[8] || match[9] || match[10] || match[11] || match[12] || id;
      if (!nodes.has(id)) {
        nodes.set(id, { id, label, raw: match[0] });
      }
    }
  }

  return nodes;
}

/**
 * Computes semantic diff between two Mermaid diagrams (flowcharts) and injects dynamic diff styles.
 */
export function computeMermaidDiff(
  oldCode: string,
  newCode: string,
  options: MermaidDiffOptions = {}
): string {
  // Base colors — defined early so empty-side paths can reuse them
  const insFill = options.insertedColor || "#e6ffec";
  const insStroke = "#22863a";
  const delFill = options.deletedColor || "#ffeef0";
  const delStroke = "#d73a49";
  const modFill = "#fffdef";
  const modStroke = "#b08800";

  // [MERMAID-02] When one side is empty, style ALL elements on the non-empty side
  // (all-inserted green or all-deleted red) rather than returning the code unstyled.
  if (!oldCode.trim()) {
    if (!isFlowchartMermaid(newCode)) {
      return newCode;
    }
    const newNodes = parseMermaidNodes(newCode);
    const newEdges = parseMermaidEdges(newCode);
    let result = newCode.trim();
    const styleLines = ["\n%% Dynamic Diff Styles (all inserted)"];
    for (const id of newNodes.keys()) {
      styleLines.push(`    style ${id} fill:${insFill},stroke:${insStroke},stroke-width:2px;`);
    }
    newEdges.forEach((_edge, idx) => {
      styleLines.push(`    linkStyle ${idx} stroke:${insStroke},stroke-width:2px;`);
    });
    if (styleLines.length > 1) { result += "\n" + styleLines.join("\n"); }
    return result;
  }
  if (!newCode.trim()) {
    if (!isFlowchartMermaid(oldCode)) {
      return oldCode;
    }
    const oldNodes = parseMermaidNodes(oldCode);
    const oldEdges = parseMermaidEdges(oldCode);
    let result = oldCode.trim();
    const ghostLines = ["\n%% Ghost definitions for deleted elements (all deleted)"];
    const styleLines = ["\n%% Dynamic Diff Styles (all deleted)"];
    for (const [id, node] of oldNodes) {
      const labelStr = node.label ? `["${node.label}"]` : "";
      ghostLines.push(`    ${id}${labelStr}`);
      styleLines.push(
        `    style ${id} fill:${delFill},stroke:${delStroke},stroke-width:1px,stroke-dasharray:5 5,opacity:0.75;`
      );
    }
    oldEdges.forEach((_edge, idx) => {
      styleLines.push(
        `    linkStyle ${idx} stroke:${delStroke},stroke-width:1px,stroke-dasharray:3 3,opacity:0.75;`
      );
    });
    if (ghostLines.length > 1) { result += "\n" + ghostLines.join("\n"); }
    if (styleLines.length > 1) { result += "\n" + styleLines.join("\n"); }
    return result;
  }

  // Guard: Only process flowcharts / graph diagrams
  if (!isFlowchartMermaid(newCode) && !isFlowchartMermaid(oldCode)) {
    return newCode;
  }

  const oldNodes = parseMermaidNodes(oldCode);
  const newNodes = parseMermaidNodes(newCode);

  const oldEdges = parseMermaidEdges(oldCode);
  const newEdges = parseMermaidEdges(newCode);

  const addedNodeIds: string[] = [];
  const removedNodeIds: string[] = [];
  const modifiedNodeIds: string[] = [];

  for (const [id, newNode] of newNodes) {
    if (!oldNodes.has(id)) {
      addedNodeIds.push(id);
    } else {
      const oldNode = oldNodes.get(id)!;
      if (oldNode.label !== newNode.label) {
        modifiedNodeIds.push(id);
      }
    }
  }

  for (const id of oldNodes.keys()) {
    if (!newNodes.has(id)) {
      removedNodeIds.push(id);
    }
  }

  // (Colors already defined above)

  let resultMermaid = newCode.trim();

  // 1. Append ghost definitions for deleted nodes & edges
  const ghostLines: string[] = [];
  if (removedNodeIds.length > 0) {
    ghostLines.push("\n%% Ghost definitions for deleted elements");
    for (const id of removedNodeIds) {
      const oldNode = oldNodes.get(id)!;
      const labelStr = oldNode.label ? `["${oldNode.label}"]` : "";
      ghostLines.push(`    ${id}${labelStr}`);
    }
  }

  // Check deleted edges
  const removedEdges: MermaidEdge[] = [];
  for (const oldEdge of oldEdges) {
    const isPresentInNew = newEdges.some(
      (e) => e.from === oldEdge.from && e.to === oldEdge.to
    );
    if (!isPresentInNew) {
      removedEdges.push(oldEdge);
      ghostLines.push(`    ${oldEdge.from} -.-> ${oldEdge.to}`);
    }
  }

  if (ghostLines.length > 0) {
    resultMermaid += "\n" + ghostLines.join("\n");
  }

  // 2. Inject Node Styles
  const styleLines: string[] = ["\n%% Dynamic Diff Styles"];

  for (const id of addedNodeIds) {
    styleLines.push(
      `    style ${id} fill:${insFill},stroke:${insStroke},stroke-width:2px;`
    );
  }

  for (const id of removedNodeIds) {
    styleLines.push(
      `    style ${id} fill:${delFill},stroke:${delStroke},stroke-width:1px,stroke-dasharray:5 5,opacity:0.75;`
    );
  }

  for (const id of modifiedNodeIds) {
    styleLines.push(
      `    style ${id} fill:${modFill},stroke:${modStroke},stroke-width:2px;`
    );
  }

  // 3. Inject Link Styles (Edges)
  newEdges.forEach((edge, idx) => {
    const isAdded = !oldEdges.some((e) => e.from === edge.from && e.to === edge.to);
    if (isAdded) {
      styleLines.push(`    linkStyle ${idx} stroke:${insStroke},stroke-width:2px;`);
    }
  });

  removedEdges.forEach((edge, offsetIdx) => {
    const totalIdx = newEdges.length + offsetIdx;
    styleLines.push(
      `    linkStyle ${totalIdx} stroke:${delStroke},stroke-width:1px,stroke-dasharray:3 3,opacity:0.75;`
    );
  });

  if (styleLines.length > 1) {
    resultMermaid += "\n" + styleLines.join("\n");
  }

  return resultMermaid;
}
