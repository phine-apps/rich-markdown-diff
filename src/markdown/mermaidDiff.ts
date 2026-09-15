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
 * Strips comments (%% ...) from a Mermaid code line while preserving %% inside quoted strings.
 */
export function stripMermaidComment(line: string): string {
  let inDoubleQuote = false;
  let inSingleQuote = false;
  const len = line.length;

  for (let i = 0; i < len; i++) {
    const c = line[i];
    if (c === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    } else if (c === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
    } else if (
      !inDoubleQuote &&
      !inSingleQuote &&
      c === "%" &&
      line[i + 1] === "%"
    ) {
      return line.substring(0, i);
    }
  }

  return line;
}

/**
 * Checks if a trimmed Mermaid line is a directive or structural keyword that should not be parsed for nodes or edges.
 */
export function isMermaidDirectiveOrSkipLine(trimmed: string): boolean {
  if (!trimmed) {
    return true;
  }
  if (/^end\b/i.test(trimmed)) {
    return true;
  }
  if (/^(?:graph|flowchart|subgraph)\b/i.test(trimmed)) {
    return true;
  }
  if (
    /^(?:style|linkStyle|classDef|class|direction|click|accTitle|accDescr|title)(?:\s|:|$)/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Removes edge labels and class annotations from a Mermaid line to prevent words inside labels from being parsed as nodes.
 */
export function stripMermaidEdgeLabels(line: string): string {
  // 1. Remove pipe labels: -->|label text| -> -->
  let cleaned = line.replace(
    /((?:--+>|---+|==+>|===+|-\.->|-\.-|<-->|<--|--o|--x|o--o|x--x)\s*)\|[^|]*\|/g,
    "$1",
  );
  // 2. Remove inline labels:
  // -- label --> -> -->, == label ==> -> ==>, -. label .-> -> -.->
  cleaned = cleaned.replace(
    /--\s*(?:["'][^"']*["']|[^\s->\n]+(?:\s+[^\s->\n]+)*)\s*(--+>|---+)/g,
    "$1",
  );
  cleaned = cleaned.replace(
    /==\s*(?:["'][^"']*["']|[^\s=>\n]+(?:\s+[^\s=>\n]+)*)\s*(==+>|===+)/g,
    "$1",
  );
  cleaned = cleaned.replace(
    /-\.\s*(?:["'][^"']*["']|[^\s\.->\n]+(?:\s+[^\s\.->\n]+)*)\s*\.(->|-)/g,
    "-.$1",
  );
  // 3. Remove class annotations attached to nodes: A:::myClass -> A
  cleaned = cleaned.replace(/:::[a-zA-Z0-9_-]+/g, "");
  return cleaned;
}

/**
 * Checks if the given Mermaid code is a Flowchart / Graph diagram.
 */
export function isFlowchartMermaid(code: string): boolean {
  const lines = code.split(/\r?\n/);
  let inFrontmatter = false;
  for (const line of lines) {
    const trimmed = stripMermaidComment(line).trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed === "---") {
      inFrontmatter = !inFrontmatter;
      continue;
    }
    if (inFrontmatter) {
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
  // 3. A -. label .-> B
  // 4. A --> B or A --- B or A ==> B or A -.- B or A -.-> B
  const SHAPE_GROUP = `(?:` +
    `\\{\\{(?:[^"}]|"[^"]*")*\\}\\}|` +
    `\\[\\((?:[^")]|"[^"]*")*\\)\\]|` +
    `\\(\\[(?:[^"\\]]|"[^"]*")*\\]\\)|` +
    `\\[\\[(?:[^"\\]]|"[^"]*")*\\]\\]|` +
    `\\(\\((?:[^")]|"[^"]*")*\\)\\)|` +
    `\\[(?:[^"\\]]|"[^"]*")*\\]|` +
    `\\((?:[^")]|"[^"]*")*\\)|` +
    `\\{(?:[^"}]|"[^"]*")*\\}|` +
    `>(?:[^"\\]]|"[^"]*")*\\]` +
  `)?`;
  const CLASS_ATTACHMENT = `(?::::[a-zA-Z0-9_-]+)?`;
  const ARROWS = `(?:--+>|---+|==+>|===+|-\\.->|-\\.-|<-->|<--|--o|--x|o--o|x--x)`;
  const ID = `([\\p{L}\\p{N}_]+(?:-[\\p{L}\\p{N}_]+)*)`;

  const edgeRegex = new RegExp(
    `(?<![\\p{L}\\p{N}_-])${ID}${SHAPE_GROUP}${CLASS_ATTACHMENT}\\s*` +
      `(?:` +
        `${ARROWS}\\s*(?:\\|([^|]+)\\|)?\\s*` +
        `|--\\s*(?:["']([^"']+)["']|([\\p{L}\\p{N}_\\s]+))\\s*(?:--+>|---+)\\s*` +
        `|==\\s*(?:["']([^"']+)["']|([\\p{L}\\p{N}_\\s]+))\\s*(?:==+>|===+)\\s*` +
        `|-\\.\\s*(?:["']([^"']+)["']|([\\p{L}\\p{N}_\\s]+))\\s*\\.(?:->|-)\\s*` +
      `)` +
      `${ID}${CLASS_ATTACHMENT}`,
    "gu",
  );

  for (const line of lines) {
    const cleanLine = stripMermaidComment(line);
    const trimmed = cleanLine.trim();
    if (isMermaidDirectiveOrSkipLine(trimmed)) {
      continue;
    }

    edgeRegex.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = edgeRegex.exec(trimmed)) !== null) {
      const from = match[1];
      const label = match[2] || match[3] || match[4] || match[5] || match[6] || match[7] || match[8];
      const to = match[9];
      if (
        from &&
        to &&
        !["graph", "flowchart", "subgraph", "end"].includes(from)
      ) {
        edges.push({
          from,
          to,
          label: label ? label.trim() : undefined,
          raw: match[0],
        });
        // Rewind lastIndex to allow chain notation (A --> B --> C)
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

  for (const line of lines) {
    const cleanLine = stripMermaidComment(line);
    const trimmed = cleanLine.trim();

    if (isMermaidDirectiveOrSkipLine(trimmed)) {
      continue;
    }

    const lineForNodes = stripMermaidEdgeLabels(cleanLine);

    const NODE_SHAPES = [
      "\\{\\{(?:[\"']([^\"']+)[\"']|([^}]+))\\}\\}",
      "\\[\\((?:[\"']([^\"']+)[\"']|([^)]+))\\)\\]",
      "\\(\\[(?:[\"']([^\"']+)[\"']|([^\\]]+))\\]\\)",
      "\\[\\[(?:[\"']([^\"']+)[\"']|([^\\]]+))\\]\\]",
      "\\(\\((?:[\"']([^\"']+)[\"']|([^)]+))\\)\\)",
      "\\[(?:[\"']([^\"']+)[\"']|([^\\]]+))\\]",
      "\\((?:[\"']([^\"']+)[\"']|([^)]+))\\)",
      "\\{(?:[\"']([^\"']+)[\"']|([^}]+))\\}",
      ">(?:[\"']([^\"']+)[\"']|([^\\]]+))\\]",
    ].join("|");

    const nodeRegex = new RegExp(
      `(?<![\\p{L}\\p{N}_-])([\\p{L}\\p{N}_]+(?:-[\\p{L}\\p{N}_]+)*)(?:${NODE_SHAPES})?`,
      "gu",
    );

    let match: RegExpExecArray | null;
    while ((match = nodeRegex.exec(lineForNodes)) !== null) {
      const id = match[1];
      if (
        [
          "graph",
          "flowchart",
          "subgraph",
          "end",
          "style",
          "linkStyle",
          "classDef",
          "class",
          "direction",
          "click",
          "accTitle",
          "accDescr",
          "title",
          "TD",
          "LR",
          "BT",
          "RL",
          "TB",
        ].includes(id)
      ) {
        continue;
      }

      const label = match.slice(2).find(Boolean) || id;
      if (!nodes.has(id)) {
        nodes.set(id, { id, label, raw: match[0] });
      }
    }
  }

  return nodes;
}

export interface MermaidDiffPair {
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
