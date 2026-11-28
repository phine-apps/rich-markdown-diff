
import * as assert from "assert";
import { MarkdownDiffProvider } from "../../markdownDiff";
import { resolveCssUrls, scopeMarpCss } from "../../markdown/marpRenderer";

describe("Marp Regression Tests", () => {
  let provider: MarkdownDiffProvider;

  beforeEach(async () => {
    provider = new MarkdownDiffProvider();
    await provider.waitForReady();
  });

  it("should detect differences in the 3rd slide when it is different", () => {
    const oldM = `---
marp: true
---
# Slide 1
Content 1

---

# Slide 2
Content 2

---

# Slide 3 (Old)
Content 3 (Old)`;

    const newM = `---
marp: true
---
# Slide 1
Content 1

---

# Slide 2
Content 2

---

# Slide 3 (New)
Content 3 (New)`;

    const { html, hasDiff } = provider.computeDiff(oldM, newM);
    
    // The 3rd slide should have diff markers (ins/del)
    // We expect it to either be matched and diffed internally, or replaced entirely.
    
    assert.ok(hasDiff, "Should detect differences in slides");
    
    // Check if "Slide 3 (New)" is present and wrapped in <ins>
    assert.ok(html.includes("Slide 3 (New)"), "New content should be present");
    
    // If it's a replacement, it should be in <ins class="... marp-slide-wrapper">
    // If it's an internal diff, it should be in <ins> inside <div class="marp-slide-wrapper">
    
    const isReplacement = html.includes('class="diffins diff-block marp-slide-wrapper">');
    const isInternalDiff = html.includes('<ins>') || html.includes('<ins class="diffins">');
    
    assert.ok(isReplacement || isInternalDiff, "3rd slide should have diff markers");
    
    if (isReplacement) {
        console.log("3rd slide treated as replacement");
    } else {
        console.log("3rd slide treated as internal diff");
    }
  });

  it("should detect small changes in the 3rd slide", () => {
    const oldM = `---
marp: true
---
# S1
---
# S2
---
# S3
Old text`;

    const newM = `---
marp: true
---
# S1
---
# S2
---
# S3
New text`;

    const { html, hasDiff } = provider.computeDiff(oldM, newM);
    // htmldiff-js might produce <ins class="diffmod">New</ins> text for "New text"
    // so we check for both words and the ins tag.
    assert.ok(hasDiff, "Should detect small changes");
    assert.ok(html.includes("New") && html.includes("text"), "New and text should be present");
    assert.ok(html.includes("<ins"), "Should have insertion tags");
    assert.ok(html.includes("<del"), "Should have deletion tags");
    assert.ok(html.includes('class="marp-slide-wrapper"'), "Should have marp wrapper");
  });

  it("should show diffs even if only the theme changed in frontmatter", () => {
      // This is a common case where Marp slides look different but content is same
      const oldM = `---
marp: true
theme: default
---
# Slide 1`;

      const newM = `---
marp: true
theme: gaia
---
# Slide 1`;

      const { html, hasDiff } = provider.computeDiff(oldM, newM);
      
      // If the theme changed, the slide string is different because of normalized attributes or content.
      // But splitMarpSlides returns the HTML of the slides.
      
      // If the theme change affects the rendered HTML (e.g. classes on section), 
      // then they will be different.
      
      // Check if there are any diff tags
      assert.ok(hasDiff, "Should detect changes when frontmatter differs");
      assert.ok(html.includes("fm-changed"), "Frontmatter should show changes");
  });

  it("should scope Marp CSS correctly and preserve keyframes selectors without prefixing", () => {
    const rawCss = `
      @keyframes fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .test-class {
        color: red;
      }
    `;
    const { scoped } = scopeMarpCss(rawCss, "#left-pane .marpit");
    
    // Check normal class scoping
    assert.ok(scoped.includes("#left-pane .marpit .test-class"), "Normal class should be scoped");
    
    // Check @keyframes preservation
    assert.ok(scoped.includes("@keyframes fade-in"), "Keyframes statement should be preserved");
    assert.ok(scoped.includes("from { opacity: 0; }"), "'from' selector inside keyframes should not be scoped");
    assert.ok(scoped.includes("to { opacity: 1; }"), "'to' selector inside keyframes should not be scoped");
    assert.ok(!scoped.includes("#left-pane .marpit from"), "'from' selector should not get prepended with scopeSelector");
  });

  it("should ignore braces in CSS comments/strings and semicolons inside @import URLs (M-7)", () => {
    const rawCss = `
      @import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;700");
      /* comment with { brace } */
      .with-content { content: "{not-a-block}"; }
      .after-comment { color: blue; }
    `;
    const { imports, scoped } = scopeMarpCss(rawCss, "#left-pane .marpit");
    assert.strictEqual(imports.length, 1);
    assert.ok(
      imports[0].includes("wght@400;700"),
      `@import URL containing ';' must not be truncated: ${imports[0]}`,
    );
    assert.ok(scoped.includes("#left-pane .marpit .with-content"));
    assert.ok(scoped.includes("#left-pane .marpit .after-comment"));
  });

  it("should skip data:, http(s): case-insensitively and protocol-relative // URLs in resolveCssUrls (M-7)", () => {
    const css = [
      "a { background: url(HTTPS://example.com/a.png); }",
      "b { background: url(DATA:image/png;base64,AAA); }",
      "c { background: url(//cdn.example.com/c.png); }",
      "d { background: url(./local.png); }",
    ].join("\n");
    const resolved = resolveCssUrls(css, (src) => `resolved:${src}`);
    assert.ok(resolved.includes("url(HTTPS://example.com/a.png)"));
    assert.ok(resolved.includes("url(DATA:image/png;base64,AAA)"));
    assert.ok(resolved.includes("url(//cdn.example.com/c.png)"));
    assert.ok(resolved.includes("url('resolved:./local.png')"));
  });
});
