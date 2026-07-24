/*
 * MIT License
 *
 * Copyright (c) 2026 Rich Markdown Diff Authors
 */

import { MarkdownDiffProvider } from "../../markdownDiff";
import * as assert from "assert";

describe("MDX and Admonition Rendering Tests", () => {
  let provider: MarkdownDiffProvider;

  beforeEach(async () => {
    provider = new MarkdownDiffProvider();
    await provider.waitForReady();
  });

  it("should render Tabs and TabItem MDX blocks correctly", () => {
    const md = `
<Tabs>
  <TabItem value="npm" label="NPM" default>
    pnpm install
  </TabItem>
  <TabItem value="yarn" label="Yarn">
    yarn install
  </TabItem>
</Tabs>
`.trim();

    const { html: diffHtml } = provider.computeDiff(md, md);

    assert.ok(diffHtml.includes('class="mdx-tabs-container"'), "Should contain mdx-tabs-container");
    assert.ok(diffHtml.includes('class="mdx-tab-content"'), "Should contain mdx-tab-content");
    assert.ok(diffHtml.includes('data-value="npm"'), "Should have npm value");
    assert.ok(diffHtml.includes('data-label="NPM"'), "Should have NPM label");
    assert.ok(diffHtml.includes('data-default="true"'), "Should mark npm as default");
    assert.ok(diffHtml.includes('data-value="yarn"'), "Should have yarn value");
    assert.ok(diffHtml.includes("pnpm install"), "Should include nested markdown text pnpm");
    assert.ok(diffHtml.includes("yarn install"), "Should include nested markdown text yarn");
  });

  it("should render self-closing and inline Badge components", () => {
    const md = `
This is a self-closing badge: <Badge text="Caution" variant="caution" />
This is an inline badge: <Badge text="Tip" variant="tip" />
`.trim();

    const { html: diffHtml } = provider.computeDiff(md, md);

    assert.ok(diffHtml.includes('class="mdx-badge mdx-badge-caution"'), "Should contain caution badge");
    assert.ok(diffHtml.includes("Caution"), "Should render caution text");
    assert.ok(diffHtml.includes('class="mdx-badge mdx-badge-tip"'), "Should contain tip badge");
    assert.ok(diffHtml.includes("Tip"), "Should render tip text");
  });

  it("should render Steps timeline blocks correctly", () => {
    const md = `
<Steps>
1. Step One
2. Step Two
</Steps>
`.trim();

    const { html: diffHtml } = provider.computeDiff(md, md);

    assert.ok(diffHtml.includes('class="mdx-steps"'), "Should contain mdx-steps");
    assert.ok(diffHtml.includes("Step One"), "Should contain step text");
  });

  it("should render Docusaurus Admonitions correctly", () => {
    const md = `
:::note Custom Note Title
This is some note content.
:::

:::danger
Danger!
:::
`.trim();

    const { html: diffHtml } = provider.computeDiff(md, md);

    assert.ok(diffHtml.includes('class="mdx-admonition mdx-admonition-note"'), "Should contain admonition-note");
    assert.ok(diffHtml.includes('class="mdx-admonition-title"'), "Should contain admonition-title");
    assert.ok(diffHtml.includes("Custom Note Title"), "Should render custom title");
    assert.ok(diffHtml.includes("This is some note content."), "Should render nested content");
    assert.ok(diffHtml.includes('class="mdx-admonition mdx-admonition-danger"'), "Should contain admonition-danger");
    assert.ok(diffHtml.includes("Danger!"), "Should render danger content");
  });

  it("should render Cards with title and icon correctly", () => {
    const md = `
<Card title="Starlight Card" icon="document">
  Card description inside.
</Card>
`.trim();

    const { html: diffHtml } = provider.computeDiff(md, md);

    assert.ok(diffHtml.includes('class="mdx-card"'), "Should render card class");
    assert.ok(diffHtml.includes('class="mdx-card-title"'), "Should render card title class");
    assert.ok(diffHtml.includes("Starlight Card"), "Should render title text");
    assert.ok(diffHtml.includes('class="mdx-card-icon mdx-codicon mdx-icon-document"'), "Should render correct icon");
    assert.ok(diffHtml.includes("Card description inside."), "Should render card nested content");
  });

  it("should fall back gracefully on unknown block and inline custom components", () => {
    const md = `
<MySpecialBlock user="Alice" age={30}>
  Some block text.
</MySpecialBlock>

And a self-closing unknown component: <CustomInline text="test" />
`.trim();

    const { html: diffHtml } = provider.computeDiff(md, md);

    // Block unknown fallback
    assert.ok(diffHtml.includes('class="mdx-fallback-card"'), "Should render block fallback card");
    assert.ok(diffHtml.includes("Custom Component: &lt;MySpecialBlock&gt;"), "Should render component tag name");
    assert.ok(diffHtml.includes("user"), "Should list property keys");
    assert.ok(diffHtml.includes("Alice"), "Should list property values");
    assert.ok(diffHtml.includes("Some block text."), "Should render nested block text");

    // Inline unknown fallback
    assert.ok(diffHtml.includes('class="mdx-inline-fallback"'), "Should render inline fallback");
    assert.ok(diffHtml.includes("&lt;CustomInline text=\"test\" /&gt;"), "Should escape and render tag snippet");
  });

  it("should support correct data-line mapping and offsets for all custom blocks", () => {
    const md = `
<Tabs>
  <TabItem value="first">
    Content
  </TabItem>
</Tabs>

:::note Title
Admonition
:::
`.trim();

    const { html: diffHtml } = provider.computeDiff(md, md);

    // Verify presence of data-line attributes inside MDX blocks and Admonitions
    assert.ok(diffHtml.includes('data-line="0"'), "Tabs block should have a data-line");
    assert.ok(diffHtml.includes('data-line="1"'), "TabItem block should have a data-line");
    assert.ok(diffHtml.includes('data-line="6"'), "Admonition block should have a data-line");
  });

  it("should not count <TabItem> as nested <Tabs> open tag (BUG-02)", () => {
    const oldDoc = `<Tabs>
  <TabItem value="apple" label="Apple">
    This is an apple.
  </TabItem>
</Tabs>
Paragraph outside tabs.`;

    const newDoc = `<Tabs>
  <TabItem value="apple" label="Apple">
    This is a fresh apple.
  </TabItem>
</Tabs>
Paragraph outside tabs.`;

    const result = provider.computeDiff(oldDoc, newDoc);
    assert.ok(result.html.includes("mdx-tabs-container"));
    assert.ok(result.html.includes("Paragraph outside tabs"));
    assert.ok(result.html.indexOf("Paragraph outside tabs") > 0);
  });
});
