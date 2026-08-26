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

    const nodeRegex = /\b([a-zA-Z0-9_]+(?:-[a-zA-Z0-9_]+)*)(?:\(\((?:["']([^"']+)["']|([^\)]+))\)\)|\[\[(?:["']([^"']+)["']|([^\]]+))\]\]|\[(?:["']([^"']+)["']|([^\]]+))\]|\((?:["']([^"']+)["']|([^\)]+))\)|\{(?:["']([^"']+)["']|([^\}]+))\}|>([^\\]]+)\])?/g;
    
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
}export interface MermaidDiffPair {
  oldMermaid: string;
  newMermaid: string;
}

/**
 * Computes semantic diff between two Mermaid diagrams (flowcharts) and injects dynamic diff styles
 * for both the original (v1) and modified (v2) versions.
 */
export function computeMermaidDiffPair(
  oldCode: string,
  newCode: string,
  options: MermaidDiffOptions = {}
): MermaidDiffPair {
  const insFill = options.insertedColor || "#132a1c";
  const insStroke = "#22c55e";
  const insText = "#4ade80";
  const delFill = options.deletedColor || "#2c1214";
  const delStroke = "#ef4444";
  const delText = "#f87171";
  const modFill = "#2e2305";
  const modStroke = "#f59e0b";
  const modText = "#fbbf24";

  if (!isFlowchartMermaid(newCode) && !isFlowchartMermaid(oldCode)) {
    return { oldMermaid: oldCode, newMermaid: newCode };
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

  // 1. Build oldMermaid (Left Pane): highlight deleted (red) & modified (amber)
  let oldMermaid = oldCode.trim();
  const oldStyleLines: string[] = ["\n%% Dynamic Diff Styles (Original)"];

  for (const id of removedNodeIds) {
    oldStyleLines.push(
      `    style ${id} fill:${delFill},stroke:${delStroke},stroke-width:2px,color:${delText};`
    );
  }

  for (const id of modifiedNodeIds) {
    oldStyleLines.push(
      `    style ${id} fill:${modFill},stroke:${modStroke},stroke-width:2.5px,color:${modText};`
    );
  }

  oldEdges.forEach((edge, idx) => {
    const isRemoved = !newEdges.some(
      (e) => e.from === edge.from && e.to === edge.to
    );
    if (isRemoved) {
      oldStyleLines.push(
        `    linkStyle ${idx} stroke:${delStroke},stroke-width:2px;`
      );
    }
  });

  if (oldStyleLines.length > 1) {
    oldMermaid += "\n" + oldStyleLines.join("\n");
  }

  // 2. Build newMermaid (Right Pane): highlight added (green) & modified (amber)
  let newMermaid = newCode.trim();
  const newStyleLines: string[] = ["\n%% Dynamic Diff Styles (Modified)"];

  for (const id of addedNodeIds) {
    newStyleLines.push(
      `    style ${id} fill:${insFill},stroke:${insStroke},stroke-width:2.5px,color:${insText};`
    );
  }

  for (const id of modifiedNodeIds) {
    newStyleLines.push(
      `    style ${id} fill:${modFill},stroke:${modStroke},stroke-width:2.5px,color:${modText};`
    );
  }

  newEdges.forEach((edge, idx) => {
    const isAdded = !oldEdges.some(
      (e) => e.from === edge.from && e.to === edge.to
    );
    if (isAdded) {
      newStyleLines.push(
        `    linkStyle ${idx} stroke:${insStroke},stroke-width:2px;`
      );
    }
  });

  if (newStyleLines.length > 1) {
    newMermaid += "\n" + newStyleLines.join("\n");
  }

  return { oldMermaid, newMermaid };
}

/**
 * Computes semantic diff between two Mermaid diagrams (flowcharts) and returns the modified diagram.
 */
export function computeMermaidDiff(
  oldCode: string,
  newCode: string,
  options: MermaidDiffOptions = {}
): string {
  return computeMermaidDiffPair(oldCode, newCode, options).newMermaid;
}
