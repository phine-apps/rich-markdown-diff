
import * as assert from "assert";
import { MarkdownDiffProvider } from "../../markdownDiff";

describe("Marp Alignment Tests", () => {
  let provider: MarkdownDiffProvider;

  beforeEach(async () => {
    provider = new MarkdownDiffProvider();
    await provider.waitForReady();
  });

  it("should detect slide insertion correctly without shifting following slides", () => {
    const oldM = `---
marp: true
---
# Slide 1
Content 1

---

# Slide 2
Content 2`;

    const newM = `---
marp: true
---
# New Slide
Inserted

---

# Slide 1
Content 1

---

# Slide 2
Content 2`;

    const { html } = provider.computeDiff(oldM, newM);
    
    // Check that "Slide 1" and "Slide 2" are NOT marked as modified
    // They should appear in both or as shared content.
    // If they were shifted, we would see <del>Slide 1</del><ins>Slide 2</ins> or similar.
    
    // The "New Slide" should be wrapped in <ins>
    assert.ok(html.includes("New Slide"), "New slide content should be present");
    assert.ok(html.includes('class="diffins diff-block marp-slide-wrapper"'), "New slide should be marked as insertion");
    
    // Slide 1 and 2 should be present
    const slide1Count = (html.match(/Slide 1/g) || []).length;
    const slide2Count = (html.match(/Slide 2/g) || []).length;
    
    assert.strictEqual(slide1Count, 1, "Slide 1 should appear once");
    assert.strictEqual(slide2Count, 1, "Slide 2 should appear once");
    
    // Ensure Slide 1 is NOT inside <ins> or <del>
    const slide1Index = html.indexOf("Slide 1");
    const slide1Fragment = html.substring(slide1Index - 200, slide1Index + 200);
    assert.ok(!slide1Fragment.includes('<ins class="diffins diff-block marp-slide-wrapper">') && !slide1Fragment.includes('<del'), "Slide 1 should be stable");
  });
});
