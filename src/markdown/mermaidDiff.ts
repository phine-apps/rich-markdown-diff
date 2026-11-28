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
  invisible?: boolean;
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
    /((?:--+>|---+|==+>|===+|-\.+->|-\.-|~~~+|<-->|<==>|<-+\.->|<-+\.-|<--|--o|--x|o--o|x--x|o--+>|x--+>)\s*)\|[^|]*\|/g,
    "$1",
  );
  // 2. Remove inline labels:
  // -- label --> -> -->, == label ==> -> ==>, -. label .-> -> -.->
  cleaned = cleaned.replace(
    /--[ \t]*(?:["'][^"']*["']|(?:[^\s>\n\-]|-(?!>))+(?:[ \t]+(?:[^\s>\n\-]|-(?!>))+)*)[ \t]*(--+>|---+)/g,
    "$1",
  );
  cleaned = cleaned.replace(
    /==[ \t]*(?:["'][^"']*["']|(?:[^\s>\n=]|=(?!>))+(?:[ \t]+(?:[^\s>\n=]|=(?!>))+)*)[ \t]*(==+>|===+)/g,
    "$1",
  );
  cleaned = cleaned.replace(
    /-\.[ \t]*(?:["'][^"']*["']|(?:[^\s.>\n\-]|-(?!>)|\.(?!->|-))+(?:[ \t]+(?:[^\s.>\n\-]|-(?!>)|\.(?!->|-))+)*)[ \t]*\.(->|-)/g,
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
  const ARROWS = `(~~~+|--+>|---+|==+>|===+|-\\.+->|-\\.-|<-->|<==>|<-+\\.->|<-+\\.-|<--|--o|--x|o--o|x--x|o--+>|x--+>)`;
  const ID = `([\\p{L}\\p{N}_]+(?:-[\\p{L}\\p{N}_]+)*)`;
  const ID_CHAR_RE = /[\p{L}\p{N}_-]/u;
  const SKIP_KEYWORDS = new Set(["graph", "flowchart", "subgraph", "end"]);

  const nodeItemRegex = new RegExp(
    `${ID}${SHAPE_GROUP}${CLASS_ATTACHMENT}`,
    "uy",
  );

  // Disjoint word-separated label patterns: prevent catastrophic backtracking (ReDoS).
  const DASH_UNQUOTED = `((?:[^\\s>\\n\\-]|-(?!>))+(?:[ \\t]+(?:[^\\s>\\n\\-]|-(?!>))+)*)`;
  const EQ_UNQUOTED = `((?:[^\\s>\\n=]|=(?!>))+(?:[ \\t]+(?:[^\\s>\\n=]|=(?!>))+)*)`;
  const DOT_UNQUOTED = `((?:[^\\s.>\\n\\-]|-(?!>)|\\.(?!->|-))+(?:[ \\t]+(?:[^\\s.>\\n\\-]|-(?!>)|\\.(?!->|-))+)*)`;

  const arrowRegex = new RegExp(
    `(?:` +
      `${ARROWS}[ \\t]*(?:\\|([^|]+)\\|)?` +
      `|--[ \\t]*(?:["']([^"']+)["']|${DASH_UNQUOTED})[ \\t]*(?:--+>|---+)` +
      `|==[ \\t]*(?:["']([^"']+)["']|${EQ_UNQUOTED})[ \\t]*(?:==+>|===+)` +
      `|-\\.[ \\t]*(?:["']([^"']+)["']|${DOT_UNQUOTED})[ \\t]*\\.(?:->|-)` +
    `)`,
    "uy",
  );

  const skipHorizontalWs = (str: string, pos: number): number => {
    while (pos < str.length && (str[pos] === " " || str[pos] === "\t")) {
      pos++;
    }
    return pos;
  };

  const readNodeGroup = (
    str: string,
    startPos: number,
  ): { ids: string[]; start: number; end: number } | null => {
    if (startPos > 0 && ID_CHAR_RE.test(str[startPos - 1])) {
      return null;
    }
    nodeItemRegex.lastIndex = startPos;
    const first = nodeItemRegex.exec(str);
    if (!first || SKIP_KEYWORDS.has(first[1])) {
      return null;
    }

    const ids: string[] = [first[1]];
    let end = nodeItemRegex.lastIndex;

    // Consume chained '&' targets/sources (e.g. A & B --> C & D)
    while (true) {
      let p = skipHorizontalWs(str, end);
      if (str[p] !== "&") {
        break;
      }
      p = skipHorizontalWs(str, p + 1);
      nodeItemRegex.lastIndex = p;
      const nextNode = nodeItemRegex.exec(str);
      if (!nextNode || SKIP_KEYWORDS.has(nextNode[1])) {
        break;
      }
      ids.push(nextNode[1]);
      end = nodeItemRegex.lastIndex;
    }

    return { ids, start: startPos, end };
  };

  for (const line of lines) {
    const cleanLine = stripMermaidComment(line);
    const trimmed = cleanLine.trim();
    if (isMermaidDirectiveOrSkipLine(trimmed)) {
      continue;
    }

    let pos = 0;
    const len = trimmed.length;

    while (pos < len) {
      pos = skipHorizontalWs(trimmed, pos);
      if (pos >= len) {
        break;
      }

      let leftGroup = readNodeGroup(trimmed, pos);
      if (!leftGroup) {
        // Advance past the current non-whitespace token to keep scanning in O(N)
        while (pos < len && trimmed[pos] !== " " && trimmed[pos] !== "\t") {
          pos++;
        }
        continue;
      }

      let chained = false;
      while (true) {
        const afterLeft = skipHorizontalWs(trimmed, leftGroup.end);
        arrowRegex.lastIndex = afterLeft;
        const arrowMatch = arrowRegex.exec(trimmed);
        if (!arrowMatch) {
          pos = chained ? leftGroup.end : leftGroup.end;
          break;
        }

        const afterArrow = skipHorizontalWs(trimmed, arrowRegex.lastIndex);
        const rightGroup = readNodeGroup(trimmed, afterArrow);
        if (!rightGroup) {
          pos = arrowRegex.lastIndex;
          break;
        }

        const invisible = !!(arrowMatch[1] && /^~~~+$/.test(arrowMatch[1]));
        const label =
          arrowMatch[2] ||
          arrowMatch[3] ||
          arrowMatch[4] ||
          arrowMatch[5] ||
          arrowMatch[6] ||
          arrowMatch[7] ||
          arrowMatch[8];
        const raw = trimmed.slice(leftGroup.start, rightGroup.end);

        for (const from of leftGroup.ids) {
          for (const to of rightGroup.ids) {
            edges.push({
              from,
              to,
              label: label ? label.trim() : undefined,
              raw,
              ...(invisible ? { invisible: true } : {}),
            });
          }
        }

        leftGroup = rightGroup;
        chained = true;
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

  // Pair edges between old and new:
  // 1. Exact match (same from, to, label, visibility) -> unchanged
  // 2. Same endpoints (from, to) with different label -> modified
  // 3. Remaining -> removed (old) / added (new)
  const matchedOld = new Array<boolean>(oldEdges.length).fill(false);
  const matchedNew = new Array<boolean>(newEdges.length).fill(false);
  const modifiedOld = new Array<boolean>(oldEdges.length).fill(false);
  const modifiedNew = new Array<boolean>(newEdges.length).fill(false);

  const edgeLabelKey = (e: MermaidEdge) => e.label ?? "";

  oldEdges.forEach((oldE, oi) => {
    const exactIdx = newEdges.findIndex(
      (newE, ni) =>
        !matchedNew[ni] &&
        newE.from === oldE.from &&
        newE.to === oldE.to &&
        edgeLabelKey(newE) === edgeLabelKey(oldE) &&
        Boolean(newE.invisible) === Boolean(oldE.invisible),
    );
    if (exactIdx !== -1) {
      matchedOld[oi] = true;
      matchedNew[exactIdx] = true;
    }
  });

  oldEdges.forEach((oldE, oi) => {
    if (matchedOld[oi]) {
      return;
    }
    const labelChangedIdx = newEdges.findIndex(
      (newE, ni) =>
        !matchedNew[ni] &&
        !modifiedNew[ni] &&
        newE.from === oldE.from &&
        newE.to === oldE.to &&
        !oldE.invisible &&
        !newE.invisible,
    );
    if (labelChangedIdx !== -1) {
      modifiedOld[oi] = true;
      modifiedNew[labelChangedIdx] = true;
    }
  });

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
    if (edge.invisible || matchedOld[idx]) {
      return;
    }
    if (modifiedOld[idx]) {
      oldStyleLines.push(
        `    linkStyle ${idx} stroke:${modStroke},stroke-width:2.5px;`
      );
    } else {
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
    if (edge.invisible || matchedNew[idx]) {
      return;
    }
    if (modifiedNew[idx]) {
      newStyleLines.push(
        `    linkStyle ${idx} stroke:${modStroke},stroke-width:2.5px;`
      );
    } else {
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
