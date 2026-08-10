/*
 * MIT License
 *
 * Copyright (c) 2026 Rich Markdown Diff Authors
 */

export interface CommonBlock {
  type: "common";
  text: string;
}

export interface ConflictBlock {
  type: "conflict";
  id: string;
  mine: string;
  theirs: string;
  base?: string;
  mineLabel?: string;
  theirsLabel?: string;
  startLine: number;
  endLine: number;
  choice?: "mine" | "theirs" | "both";
}

export type DocBlock = CommonBlock | ConflictBlock;

/**
 * Parses markdown text containing Git conflict markers (<<<<<<<, |||||||, =======, >>>>>>>)
 * into a sequence of Common and Conflict blocks.
 */
export function parseConflictBlocks(content: string): DocBlock[] {
  const lines = content.split(/\r?\n/);
  const blocks: DocBlock[] = [];

  let currentCommonLines: string[] = [];
  let inConflict = false;

  let conflictIdCounter = 1;
  let conflictMineLines: string[] = [];
  let conflictBaseLines: string[] = [];
  let conflictTheirsLines: string[] = [];
  let mineLabel = "";
  let conflictStartLine = 0;
  let section: "mine" | "base" | "theirs" = "mine";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Git conflict markers start with <<<<<<<, |||||||, =======, >>>>>>>
    if (line.startsWith("<<<<<<<")) {
      if (currentCommonLines.length > 0) {
        blocks.push({
          type: "common",
          text: currentCommonLines.join("\n"),
        });
        currentCommonLines = [];
      }
      inConflict = true;
      section = "mine";
      conflictStartLine = i;
      mineLabel = line.substring(7).trim() || "Current (Mine)";
      conflictMineLines = [];
      conflictBaseLines = [];
      conflictTheirsLines = [];
      continue;
    }

    if (inConflict && line.startsWith("|||||||")) {
      section = "base";
      continue;
    }

    if (inConflict && line.startsWith("=======")) {
      section = "theirs";
      continue;
    }

    if (inConflict && line.startsWith(">>>>>>>")) {
      const theirsLabel = line.substring(7).trim() || "Incoming (Theirs)";
      blocks.push({
        type: "conflict",
        id: `conflict-${conflictIdCounter++}`,
        mine: conflictMineLines.join("\n"),
        theirs: conflictTheirsLines.join("\n"),
        base: conflictBaseLines.length > 0 ? conflictBaseLines.join("\n") : undefined,
        mineLabel,
        theirsLabel,
        startLine: conflictStartLine,
        endLine: i,
      });
      inConflict = false;
      continue;
    }

    if (inConflict) {
      if (section === "base") {
        conflictBaseLines.push(line);
      } else if (section === "theirs") {
        conflictTheirsLines.push(line);
      } else {
        conflictMineLines.push(line);
      }
    } else {
      currentCommonLines.push(line);
    }
  }

  // Safely rescue unclosed conflict marker
  if (inConflict) {
    const unclosedLines: string[] = [
      `<<<<<<< ${mineLabel}`,
      ...conflictMineLines,
    ];
    if (conflictBaseLines.length > 0) {
      unclosedLines.push("|||||||");
      unclosedLines.push(...conflictBaseLines);
    }
    if (section === "theirs") {
      unclosedLines.push("=======");
      unclosedLines.push(...conflictTheirsLines);
    }
    currentCommonLines.push(...unclosedLines);
  }

  if (currentCommonLines.length > 0) {
    blocks.push({
      type: "common",
      text: currentCommonLines.join("\n"),
    });
  }

  return blocks;
}

/**
 * Reconstructs document text based on conflict choices made by the user.
 */
export function reconstructDocument(blocks: DocBlock[]): string {
  const resultLines: string[] = [];

  for (const block of blocks) {
    if (block.type === "common") {
      resultLines.push(block.text);
    } else {
      if (block.choice === "mine") {
        resultLines.push(block.mine);
      } else if (block.choice === "theirs") {
        resultLines.push(block.theirs);
      } else if (block.choice === "both") {
        resultLines.push(block.mine);
        resultLines.push(block.theirs);
      } else {
        // Unresolved: keep conflict markers intact
        resultLines.push(`<<<<<<< ${block.mineLabel || "HEAD"}`);
        resultLines.push(block.mine);
        if (block.base !== undefined) {
          resultLines.push("|||||||");
          resultLines.push(block.base);
        }
        resultLines.push("=======");
        resultLines.push(block.theirs);
        resultLines.push(`>>>>>>> ${block.theirsLabel || "Incoming"}`);
      }
    }
  }

  return resultLines.join("\n");
}
