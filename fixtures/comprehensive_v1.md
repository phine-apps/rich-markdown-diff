# Comprehensive Markdown Test Document

This document tests all supported markdown extensions.

## Text Formatting

This is **Bold text** and this is _Italic text_.
You can also use ~~Strikethrough~~ and `inline code`.
Use ==highlighted text== for emphasis.

## Lists

### Unordered List

- Item 1

- Item 3

### Ordered List

1. First item
2. Second item (older)
3. Third item

### Task List

- [ ] Task 1
- [x] Task 2

## Code Blocks

```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
  console.log(`Good night!`);
}
```

## Tables

| Feature           | Status |
| ----------------- | ------ |
| Text diff         | ✅     |
| Code highlighting | ❌     |
| Emoji support     | ✅     |
| Obsidian support  | ✅     |

## Links and Images

[Visit GitHub](https://github.com)

## Blockquotes

> This is a blockquote.
> It can span multiple lines.

## Emoji

:smile: :rocket: :+1:

## Math (KaTeX)

Inline math: $E = mc^2$ and $F = ma$

Block math:

$$
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
$$

## Mermaid Diagrams

```mermaid
graph TD
    Start[User Login] --> B[Review Request]
    B --> LegacyStep[Manual Approval]
    B --> End[Complete]
```

## GitHub Alerts

> [!NOTE]
> This is a note alert.

> [!WARNING]
> This is a warning alert.

# Obsidian

#mermaid #日本語

![[Page]]

## Footnotes

This is a sentence with a footnote[^1].

[^1]: This is the footnote content.

## Wikilinks

See [[Related Page]] for more information.

## Subscript and Superscript

Water formula: H~2~O
Einstein's equation: E = mc^2^

## Definition Lists

Term 1
: Definition for term 1

Term 2
: Definition for term 2

## Common Block (Folding Test)

MIT License

Copyright (c) 2026 Rich Markdown Diff Authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Image Test

![Icon V1](img_v1.svg)

## MDX and Custom Components

<Tabs>
  <TabItem value="npm" label="NPM" default>
    - Install package:
      ```bash
      npm install my-package
      ```
  </TabItem>
  <TabItem value="yarn" label="Yarn">
    - Install package:
      ```bash
      yarn add my-package
      ```
  </TabItem>
</Tabs>

Let's test inline badges: <Badge text="Caution" variant="caution" /> and <Badge text="Deprecated" variant="danger" />.

And here is a Starlight steps component:

<Steps>
1. Download the tool
2. Configure settings
3. Start running
   </Steps>

Here is a Starlight Card:

<Card title="Introduction" icon="document">
  Welcome to the premium card view.
</Card>

And a Docusaurus Admonition:
:::note Note Title
This is standard admonition text in v1.
:::

And a custom unknown fallback element:

<CustomReactComponent user="alice" role="admin" />

## Summary

This is version 1 of the comprehensive test document.
