/*
 * MIT License
 */

import * as crypto from "crypto";

/**
 * Handles HTML diff post-processing and structural comparisons.
 */
export class DiffPipeline {
  public stripDataLineAttributes(html: string): string {
    return html.replace(/\s+data-line="\d+"/g, "");
  }

  public replaceComplexBlocksWithTokens(
    html: string,
    options: { tokenizeListContainers?: boolean; tokenizeCodeBlocks?: boolean; tokenizeFootnotes?: boolean } = {},
  ): { html: string; tokens: Record<string, string> } {
    const tokens: Record<string, string> = {};
    const result = this.replaceBalancedTagsSequential(html, tokens, options);
    return { html: result, tokens };
  }

  public replaceCheckboxesWithTokens(html: string): { html: string; tokens: Record<string, string> } {
    const tokens: Record<string, string> = {};
    const regex = /<input[^>]+class="task-list-item-checkbox"[^>]*>/gi;
    const result = html.replace(regex, (match) => this.createToken(match, "CHECKBOX", tokens));
    return { html: result, tokens };
  }

  private replaceBalancedTagsSequential(
    html: string,
    tokens: Record<string, string>,
    options: { tokenizeListContainers?: boolean; tokenizeCodeBlocks?: boolean; tokenizeFootnotes?: boolean } = {},
  ): string {
    let result = "";
    let i = 0;
    while (i < html.length) {
      if (html.startsWith('<div class="mermaid"', i)) {
        const end = this.findClosing(html, i, "div");
        if (end > -1) { result += this.createToken(html.substring(i, end), "MERMAID", tokens); i = end; continue; }
      }
      if (html.startsWith('<div class="markdown-alert', i)) {
        const end = this.findClosing(html, i, "div");
        if (end > -1) { result += this.createToken(html.substring(i, end), "ALERT", tokens); i = end; continue; }
      }
      if (options.tokenizeCodeBlocks !== false && html.startsWith("<pre", i)) {
        const end = this.findClosing(html, i, "pre");
        if (end > -1) { result += this.createToken(html.substring(i, end), "CODEBLOCK", tokens); i = end; continue; }
      }
      if (html.startsWith("<hr", i)) {
        const end = html.indexOf(">", i) + 1;
        if (end > 0) { result += this.createToken(html.substring(i, end), "HR", tokens); i = end; continue; }
      }
      if (options.tokenizeFootnotes !== false && html.startsWith("<li", i)) {
        const tagEnd = html.indexOf(">", i);
        if (tagEnd > -1) {
          const tag = html.substring(i, tagEnd + 1);
          if (tag.includes('class="footnote-item"') || tag.includes("class='footnote-item'")) {
            const end = this.findClosing(html, i, "li");
            if (end > -1) { result += this.createToken(html.substring(i, end), "FOOTNOTE", tokens); i = end; continue; }
          }
        }
      }
      if (html.startsWith('<p class="katex-block"', i) || html.startsWith("<p class='katex-block'", i)) {
        const end = this.findClosing(html, i, "p");
        if (end > -1) { result += this.createToken(html.substring(i, end), "MATHBLOCK", tokens); i = end; continue; }
      }
      if (html.startsWith('<span class="katex"', i) || html.startsWith("<span class='katex'", i)) {
        const end = this.findClosing(html, i, "span");
        if (end > -1) { result += this.createToken(html.substring(i, end), "MATH", tokens); i = end; continue; }
      }
      if (options.tokenizeListContainers !== false && html[i] === "<") {
        const listMatch = html.substring(i).match(/^<(ol|ul|dl|table)(\s[^>]*)?>/i);
        if (listMatch) {
          const tagName = listMatch[1].toLowerCase();
          const end = this.findClosing(html, i, tagName);
          if (end > -1) {
            result += this.createToken(html.substring(i, end), tagName === "table" ? "TABLE" : `LIST_${tagName.toUpperCase()}`, tokens);
            i = end; continue;
          }
        }
      }
      if (html[i] === "<") {
        const headingMatch = html.substring(i).match(/^<(h[1-6])(\s[^>]*)?>/i);
        if (headingMatch) {
          const tagName = headingMatch[1];
          const end = this.findClosing(html, i, tagName);
          if (end > -1) { result += this.createToken(html.substring(i, end), "HEADING", tokens); i = end; continue; }
        }
      }
      result += html[i]; i++;
    }
    return result;
  }

  private findClosing(html: string, start: number, tagName: string): number {
    let depth = 0; const openTag = `<${tagName}`; const closeTag = `</${tagName}>`;
    for (let i = start; i < html.length; i++) {
        if (html.startsWith(openTag, i)) {depth++;}
        else if (html.startsWith(closeTag, i)) { depth--; if (depth === 0) {return i + closeTag.length;} }
    }
    return -1;
  }

  private createToken(content: string, prefix: string, tokens: Record<string, string>): string {
    const hashContent = content.replace(/\s?data-line="[^"]*"/g, "");
    const hash = crypto.createHash("sha256").update(hashContent).digest("hex").substring(0, 12);
    const token = `TOKEN_${prefix}_${hash}`; tokens[token] = content; return token;
  }

  public restoreComplexTokens(html: string, tokens: Record<string, string>): string {
    let restored = html; const sortedTokens = Object.keys(tokens).sort((a, b) => b.length - a.length);
    sortedTokens.forEach((token) => { restored = restored.replace(new RegExp(token, "g"), tokens[token]); });
    return restored;
  }

  public consolidateBlockDiffs(html: string): string {
    const blocks = ["table", "ul", "ol", "dl", "blockquote", "div", "h1", "h2", "h3", "h4", "h5", "h6", "section", "svg", "pre", "hr"];
    let res = html; const blockTags = "table|ul|ol|dl|blockquote|div|h1|h2|h3|h4|h5|h6|section|svg|pre"; const scTags = "hr";
    const pattern = `(?:<(?:${blockTags})[^>]*>[\\s\\S]*?<\\/(?:${blockTags})>|<(?:${scTags})[^>]*\\/?>)`;
    res = res.replace(new RegExp(`<(ins|del) class="([^"]*)">(\\s*(?:${pattern}\\s*)+)<\\/\\1>`, "gi"), (m, t, c, i) => !c.includes("diff-block") ? `<${t} class="${c} diff-block">${i}</${t}>` : m);
    blocks.forEach((tag) => {
      res = res.replace(new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"), (m) => {
        if (this.checkIfAllContentIsWrapped(m, "del")) {return `<del class="diffdel diff-block">${this.cleanInnerDiffTags(m, "del")}</del>`;}
        if (this.checkIfAllContentIsWrapped(m, "ins")) {return `<ins class="diffins diff-block">${this.cleanInnerDiffTags(m, "ins")}</ins>`;}
        return m;
      });
    });
    return res;
  }

  private checkIfAllContentIsWrapped(html: string, type: "ins" | "del"): boolean {
    const totalText = html.replace(/<[^>]+>/g, "").replace(/\s/g, "");
    const stripped = html.replace(new RegExp(`<${type}[^>]*?>[\\s\\S]*?<\\/${type}>`, "gi"), "");
    const remainingText = stripped.replace(/<[^>]+>/g, "").replace(/\s/g, "");
    return remainingText.length === 0 && totalText.length > 0;
  }

  private cleanInnerDiffTags(html: string, type: "ins" | "del"): string {
    return html.replace(new RegExp(`<${type}[^>]*?>`, "gi"), "").replace(new RegExp(`<\\/${type}>`, "gi"), "");
  }

  public refineBlockDiffs(html: string, execute: (old: string, newHtml: string) => string): string {
    const fragmentDiff = (o: string, n: string) => this.diffHtmlFragments(o, n, execute);
    const replacer = (_m: string, _d: string, oH: string, _i: string, nH: string) => {
      const alertCount = (nH.match(/class=["']markdown-alert/g) || []).length; if (alertCount > 1) {return _m;}
      const fnRe = /<li[^>]*class=["']footnote-item["'][^>]*>[\s\S]*?<\/li>/gi, ofs = oH.match(fnRe) || [], nfs = nH.match(fnRe) || [];
      if (ofs.length !== nfs.length || ofs.length > 1) {
        let r = "";
        const getFnId = (h: string) => h.match(/\bid=["']([^"']+)["']/i)?.[1] ?? null, processedNew = new Set<number>();
        ofs.forEach(of => {
          const id = getFnId(of); let idx = id ? nfs.findIndex((nf, i) => !processedNew.has(i) && getFnId(nf) === id) : -1;
          if (idx === -1 && ofs.length === nfs.length) {idx = nfs.findIndex((_, i) => !processedNew.has(i));}
          if (idx !== -1) { processedNew.add(idx); r += fragmentDiff(of, nfs[idx]); } else {r += `<del class="diffdel">${of}</del>`;}
        });
        nfs.forEach((nf, i) => { if (!processedNew.has(i)) {r += `<ins class="diffins">${nf}</ins>`;} });
        const start = nH.match(/^<(ol|ul|dl)[^>]*>/i)?.[0] || oH.match(/^<(ol|ul|dl)[^>]*>/i)?.[0];
        const end = `</${(nH.match(/^<(ol|ul|dl)/i)?.[1] || oH.match(/^<(ol|ul|dl)/i)?.[1] || "ol").toLowerCase()}>`;
        return start ? `${start}\n${r}\n${end}` : r;
      }
      return fragmentDiff(oH, nH);
    };
    let res = html;
    const alertRe = /<del[^>]*>(\s*<div[^>]*class=["']markdown-alert[^>]*>[\s\S]*?<\/div>\s*)<\/del>\s*<ins[^>]*>(\s*<div[^>]*class=["']markdown-alert[^>]*>[\s\S]*?<\/div>\s*)<\/ins>/gi;
    res = res.replace(alertRe, (m, delInner: string, insInner: string) => {
      const tRe = /<p[^>]*class=["']markdown-alert-title["'][^>]*>([\s\S]*?)<\/p>/, ot = delInner.match(tRe), nt = insInner.match(tRe);
      if (ot && nt && ot[0].replace(/data-line="\d+"/g, "") === nt[0].replace(/data-line="\d+"/g, "")) {
        const bo = delInner.replace(ot[0], ""), bn = insInner.replace(ot[0], "");
        const op = insInner.match(/<div[^>]*class=["']markdown-alert[^>]*>/)?.[0] || '<div class="markdown-alert">';
        return `${op}${ot[0]}\n${execute(bo, bn)}</div>`;
      }
      return m;
    });
    const containerRe = /<del[^>]*>\s*<(ol|ul|dl)([^>]*)>([\s\S]*?)<\/\1>\s*<\/del>\s*<ins[^>]*>\s*<(ol|ul|dl)([^>]*)>([\s\S]*?)<\/\4>\s*<\/ins>/gi;
    res = res.replace(containerRe, (m, ot, oa, oc, nt, na, nc) => {
      if (ot.toLowerCase() !== nt.toLowerCase()) {return this.createStructuralListContainerDiff(ot, oa, oc, nt, na, nc);}
      return replacer(m, m, `<${ot}${oa}>${oc}</${ot}>`, m, `<${nt}${na}>${nc}</${nt}>`);
    });
    const hRe = /<del[^>]*>\s*<(h[1-6])([^>]*)>([\s\S]*?)<\/\1>\s*<\/del>\s*<ins[^>]*>\s*<(h[1-6])([^>]*)>([\s\S]*?)<\/\4>\s*<\/ins>/gi;
    res = res.replace(hRe, (m, ot: string, oa: string, oc: string, nt: string, na: string, nc: string) => ot.toLowerCase() !== nt.toLowerCase() || /<\/?h[1-6][\s>]/.test(nc) ? m : `<${nt}${na}>${fragmentDiff(oc, nc)}</${nt}>`);
    const delInterPattern = "((?:\\s*<del[^>]*>(?:(?!<(?:pre|blockquote|table))([\\s\\S]))*?<\\/del>\\s*)*)";
    const preRe = new RegExp(`(<del[^>]*>\\s*<pre[^>]*>([\\s\\S]*?)<\\/pre>\\s*<\\/del>)${delInterPattern}(<ins[^>]*>\\s*<pre[^>]*>([\\s\\S]*?)<\\/pre>\\s*<\\/ins>)`, "gi");
    res = res.replace(preRe, (m, _d, oc, inter, _i, nc) => fragmentDiff(`<pre>${oc}</pre>`, `<pre>${nc}</pre>`) + inter);
    const bqRe = new RegExp(`(<del[^>]*>\\s*<blockquote>([\\s\\S]*?)<\\/blockquote>\\s*<\\/del>)${delInterPattern}(<ins[^>]*>\\s*<blockquote>([\\s\\S]*?)<\\/blockquote>\\s*<\\/ins>)`, "gi");
    res = res.replace(bqRe, (m, _d, oc, inter, _i, nc) => fragmentDiff(`<blockquote>${oc}</blockquote>`, `<blockquote>${nc}</blockquote>`) + inter);
    const tRe = new RegExp(`(<del[^>]*>\\s*<table[^>]*>([\\s\\S]*?)<\\/table>\\s*<\\/del>)${delInterPattern}(<ins[^>]*>\\s*<table[^>]*>([\\s\\S]*?)<\\/table>\\s*<\\/ins>)`, "gi");
    res = res.replace(tRe, (m, _d, _oc, inter) => {
      const oi = m.match(/<del[^>]*>\s*(<table[^>]*>[\s\S]*?<\/table>)\s*<\/del>/i)?.[1], ni = m.match(/<ins[^>]*>\s*(<table[^>]*>[\s\S]*?<\/table>)\s*<\/ins>/i)?.[1];
      return (oi && ni ? this.diffTables(oi, ni, fragmentDiff) : m) + inter;
    });
    return res;
  }

  private diffHtmlFragments(oldHtml: string, newHtml: string, execute: (old: string, newH: string) => string): string {
    const { html: oldT, tokens: t1 } = this.replaceComplexBlocksWithTokens(oldHtml, { tokenizeListContainers: false, tokenizeCodeBlocks: false, tokenizeFootnotes: false });
    const { html: newT, tokens: t2 = {} } = this.replaceComplexBlocksWithTokens(newHtml, { tokenizeListContainers: false, tokenizeCodeBlocks: false, tokenizeFootnotes: false });
    const { html: oldC, tokens: t1C = {} } = this.replaceCheckboxesWithTokens(oldT);
    const { html: newC, tokens: t2C = {} } = this.replaceCheckboxesWithTokens(newT);
    const all = { ...t1, ...t2, ...t1C, ...t2C };
    let res = execute(oldC, newC);
    res = this.fixInvalidNesting(res);
    res = this.normalizeListContainerChanges(res);
    res = this.restoreComplexTokens(res, all);
    res = this.cleanupCheckboxArtifacts(res);
    return res;
  }

  public fixInvalidNesting(html: string): string {
    const tags = ["em", "strong", "b", "i", "code", "span", "a", "ins", "del"];
    let f = html; tags.forEach(t => { f = f.replace(new RegExp(`<\/ins><\/${t}>`, "g"), `</${t}></ins>`).replace(new RegExp(`<\/del><\/${t}>`, "g"), `</${t}></del>`); });
    return f;
  }

  public normalizeListContainerChanges(html: string): string {
    return html.replace(/(<del[^>]*>\s*<(ul|ol|dl)>[\s\S]*?<\/\2>\s*<\/del>)\s*(<ins[^>]*>\s*<(ul|ol|dl)>[\s\S]*?<\/\4>\s*<\/ins>)/gi, (m, d: string, _dt: string, i: string, _it: string) => d.replace(/class="([^"]*)"/, 'class="$1 diff-list-container-change"') + i.replace(/class="([^"]*)"/, 'class="$1 diff-list-container-change"'));
  }

  public cleanupCheckboxArtifacts(html: string): string {
    return html.replace(/(<input[^>]+class="task-list-item-checkbox"[^>]*>)(\s*)(?=(?:<p\b|<div\b|<ins[^>]*>\s*\[))/gi, '<del class="diffdel">$1</del>$2');
  }

  public splitMixedBlockInsertions(html: string): string {
    let r = html; ["ins", "del"].forEach(t => {
      const c = t === "ins" ? "diffins" : "diffdel";
      r = r.replace(new RegExp(`<${t}\\b[^>]*>([\\s\\S]*?)<\/${t}>`, "gi"), (m, i: string) => {
        if (!/<h[1-6][\s>]/i.test(i)) {return m;}
        const pts = i.split(/(?=<(?:h[1-6]|p|ul|ol|dl|blockquote|pre|table|hr)[\s>/])|(?<=<\/h[1-6]>)\s*(?=\S)/i);
        if (pts.length <= 1) {return m;}
        return pts.map(p => { const tr = p.trim(); return tr ? `<${t} class="${c}">${tr}</${t}>` : ""; }).filter(x => x).join("\n");
      });
    });
    return r;
  }

  public extractSharedReparentedLists(html: string): string {
    const norm = (f: string) => f.replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
    const findD = (s: string, idx: number, nS: string) => {
      const p = s.slice(0, idx);
      const re = /(?:<del[^>]*>\s*<\/del>\s*)?<del[^>]*class="[^"]*diff-block[^"]*"[^>]*>\s*(<(ul|ol|dl)[^>]*>[\s\S]*?<\/\2>)\s*<\/del>(?:\s*<del[^>]*>\s*<\/del>)?/gi;
      let m, r = null; while ((m = re.exec(p)) !== null) {if (norm(m[1]) === nS) {r = m[0];}}
      return r;
    };
    let r = html;
    const cRe = /<ins([^>]*)>\s*(<(ol|ul|dl)[^>]*>\s*<li[\s\S]*?<\/li>\s*<\/\3>)\s*(<(ul|ol|dl)[^>]*>[\s\S]*?<\/\5>)\s*<\/ins>/gi;
    let m; while ((m = cRe.exec(r)) !== null) {
      const d = findD(r, r.indexOf(m[0]), norm(m[4]));
      if (d) { r = r.replace(d, ""); r = r.replace(m[0], `<ins${m[1]}>${m[3]}</ins>\n${m[4]}`); }
    }
    const lRe = /<ins([^>]*)>\s*(<(ul|ol|dl)[^>]*>[\s\S]*?<\/\3>)\s*<\/ins>/gi;
    while ((m = lRe.exec(r)) !== null) {
      const d = findD(r, r.indexOf(m[0]), norm(m[2]));
      if (d) { r = r.replace(d, ""); r = r.replace(m[0], m[2]); }
    }
    return r;
  }

  public markGhostListItems(html: string): string {
    return html.replace(/<li([^>]*)>([\s\S]*?)<\/li>/gi, (m, a: string, c: string) => {
      if (/<li\b/i.test(c)) {return m;}
      const s = (t: string) => t.replace(/<\/?(strong|em|b|i|s|span|a)\b[^>]*>/gi, "").trim();
      const wI = c.replace(/<ins\b[^>]*>[\s\S]*?<\/ins>/gi, ""), wD = c.replace(/<del\b[^>]*>[\s\S]*?<\/del>/gi, "");
      let nA = a; if (s(wI) === "") {nA += ' data-all-inserted="true"';} if (s(wD) === "") {nA += ' data-all-deleted="true"';}
      return nA === a ? m : `<li${nA}>${c}</li>`;
    });
  }

  public wrapHeadingPrefixes(html: string): string {
    return html.replace(/(<h[1-6][^>]*>)((?:\s*(?:<(?:del|ins)[^>]*>)?\s*[\d\.\[\]]+\s*(?:<\/(?:del|ins)>)?\s*)+(?:\]\s*)?(?=\S))/gi, (m, t: string, p: string) => {
      if (!/<(ins|del)\b/.test(p)) {return m;}
      const c = (x: string) => (p.match(new RegExp(x, "g")) || []).length;
      if (c("<ins\\b") !== c("<\/ins>") || c("<del\\b") !== c("<\/del>")) {return m;}
      return t + '<span class="heading-prefix">' + p + "</span>";
    });
  }

  public diffTables(oldHtml: string, newHtml: string, execute: (o: string, n: string) => string): string {
    const oT = this.parseTable(oldHtml), nT = this.parseTable(newHtml);
    return this.renderMergedTable(oT, nT, this.alignCol(oT.headers, nT.headers), this.alignRow(oT.rows, nT.rows), execute);
  }

  private parseTable(html: string) {
    const rows: { cells: { html: string; attrs: string; tag: string }[]; attrs: string; }[] = [], headers: { html: string; attrs: string }[] = [];
    const theadMatch = html.match(/<thead>([\s\S]*?)<\/thead>/i);
    if (theadMatch) {
      theadMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)?.forEach(trHtml => {
        trHtml.match(/<th[^>]*>([\s\S]*?)<\/th>/gi)?.forEach(thHtml => {
          headers.push({ html: thHtml.replace(/<th[^>]*>([\s\S]*?)<\/th>/i, "$1"), attrs: thHtml.replace(/<th([^>]*)>[\s\S]*?<\/th>/i, "$1") });
        });
      });
    }
    const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/i);
    if (tbodyMatch) {
      tbodyMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)?.forEach(trHtml => {
        const trAttrs = trHtml.replace(/<tr([^>]*)>[\s\S]*?<\/tr>/i, "$1"), cells: any[] = [];
        trHtml.match(/<td[^>]*>([\s\S]*?)<\/td>/gi)?.forEach(tdHtml => {
          cells.push({ html: tdHtml.replace(/<td[^>]*>([\s\S]*?)<\/td>/i, "$1"), attrs: tdHtml.replace(/<td([^>]*)>[\s\S]*?<\/td>/i, "$1"), tag: "td" });
        });
        rows.push({ cells, attrs: trAttrs });
      });
    }
    return { headers, rows, tableAttrs: html.match(/<table([^>]*)>/i)?.[1] || "" };
  }

  private alignCol(o: any[], n: any[]) {
    const m: any[] = [], u = new Set<number>();
    o.forEach((h, i) => {
      const t = h.html.replace(/<[^>]+>/g, "").trim().toLowerCase();
      const idx = t ? n.findIndex((nh, ni) => !u.has(ni) && nh.html.replace(/<[^>]+>/g, "").trim().toLowerCase() === t) : -1;
      if (idx !== -1) { u.add(idx); m.push({ oldIdx: i, newIdx: idx }); } else {m.push({ oldIdx: i, newIdx: null });}
    });
    n.forEach((_, i) => { if (!u.has(i)) {m.push({ oldIdx: null, newIdx: i });} });
    return m.sort((a, b) => (a.newIdx !== null ? a.newIdx : 1000 + (a.oldIdx || 0)) - (b.newIdx !== null ? b.newIdx : 1000 + (b.oldIdx || 0)));
  }

  private alignRow(o: any[], n: any[]) {
    const m: any[] = [], u = new Set<number>();
    o.forEach((r, i) => {
      const id = r.cells[0]?.html.replace(/<[^>]+>/g, "").trim();
      const idx = id ? n.findIndex((nr, ni) => !u.has(ni) && nr.cells[0]?.html.replace(/<[^>]+>/g, "").trim() === id) : -1;
      if (idx !== -1) { u.add(idx); m.push({ oldIdx: i, newIdx: idx }); } else {m.push({ oldIdx: i, newIdx: null });}
    });
    n.forEach((_, i) => { if (!u.has(i)) {m.push({ oldIdx: null, newIdx: i });} });
    return m.sort((a, b) => (a.newIdx ?? 1000) - (b.newIdx ?? 1000));
  }

  private renderMergedTable(oT: any, nT: any, cM: any[], rM: any[], execute: any) {
    let h = `<table${nT.tableAttrs || oT.tableAttrs}><thead><tr>`;
    cM.forEach(m => {
      const cls = m.newIdx === null ? "diff-col-del" : m.oldIdx === null ? "diff-col-ins" : "";
      if (m.oldIdx !== null && m.newIdx !== null) {h += `<th${this.appCls(nT.headers[m.newIdx].attrs, cls)}>${execute(oT.headers[m.oldIdx].html, nT.headers[m.newIdx].html)}</th>`;}
      else if (m.oldIdx !== null) {h += `<th${this.appCls(oT.headers[m.oldIdx].attrs, cls)}><del class="diffdel">${oT.headers[m.oldIdx].html}</del></th>`;}
      else {h += `<th${this.appCls(nT.headers[m.newIdx!].attrs, cls)}><ins class="diffins">${nT.headers[m.newIdx!].html}</ins></th>`;}
    });
    h += "</tr></thead><tbody>";
    rM.forEach(rm => {
      if (rm.oldIdx !== null && rm.newIdx !== null) {
        h += `<tr${nT.rows[rm.newIdx].attrs}>`;
        cM.forEach(cm => {
          const cls = cm.newIdx === null ? "diff-col-del" : cm.oldIdx === null ? "diff-col-ins" : "";
          if (cm.oldIdx !== null && cm.newIdx !== null) {h += `<td${this.appCls(nT.rows[rm.newIdx].cells[cm.newIdx].attrs, cls)}>${execute(oT.rows[rm.oldIdx].cells[cm.oldIdx].html, nT.rows[rm.newIdx].cells[cm.newIdx].html)}</td>`;}
          else if (cm.oldIdx !== null) {h += `<td${this.appCls(oT.rows[rm.oldIdx].cells[cm.oldIdx].attrs, cls)}><del class="diffdel">${oT.rows[rm.oldIdx].cells[cm.oldIdx].html}</del></td>`;}
          else {h += `<td${this.appCls(nT.rows[rm.newIdx!].cells[cm.newIdx!].attrs, cls)}><ins class="diffins">${nT.rows[rm.newIdx!].cells[cm.newIdx!].html}</ins></td>`;}
        });
        h += "</tr>";
      } else if (rm.oldIdx !== null) {
        h += `<tr${oT.rows[rm.oldIdx].attrs} class="diffdel">`;
        cM.forEach(cm => { const cls = cm.newIdx === null ? "diff-col-del" : cm.oldIdx === null ? "diff-col-ins" : ""; if (cm.oldIdx !== null) {h += `<td${this.appCls(oT.rows[rm.oldIdx].cells[cm.oldIdx].attrs, cls)}><del class="diffdel">${oT.rows[rm.oldIdx].cells[cm.oldIdx].html}</del></td>`;} else {h += `<td${this.appCls("", cls)}></td>`;} });
        h += "</tr>";
      } else {
        h += `<tr${nT.rows[rm.newIdx!].attrs} class="diffins">`;
        cM.forEach(cm => { const cls = cm.newIdx === null ? "diff-col-del" : cm.oldIdx === null ? "diff-col-ins" : ""; if (cm.newIdx !== null) {h += `<td${this.appCls(nT.rows[rm.newIdx!].cells[cm.newIdx].attrs, cls)}><ins class="diffins">${nT.rows[rm.newIdx!].cells[cm.newIdx].html}</ins></td>`;} else {h += `<td${this.appCls("", cls)}></td>`;} });
        h += "</tr>";
      }
    });
    return h + "</tbody></table>";
  }

  private appCls(a: string, c: string): string { return c ? (a.includes('class="') ? a.replace('class="', `class="${c} `) : ` class="${c}"${a}`) : a; }

  private createStructuralListContainerDiff(ot: string, oa: string, ob: string, nt: string, na: string, nb: string): string {
    return `<del class="diffdel diff-block diff-list-container-change"><${ot}${oa}>${ob}</${ot}></del><ins class="diffins diff-block diff-list-container-change"><${nt}${na}>${nb}</${nt}></ins>`;
  }
}
