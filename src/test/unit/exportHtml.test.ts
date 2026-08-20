import * as assert from "assert";
import {
  extractLocalFsPath,
  getMimeType,
  isAllowedAsset,
  prepareExportHtml,
} from "../../exportHtml";

describe("Export HTML Module", () => {
  describe("extractLocalFsPath", () => {
    it("should extract fsPath from vscode-resource.vscode-cdn.net (percent-encoded +)", () => {
      const uri = "https://file%2B.vscode-resource.vscode-cdn.net/Users/test/image.png";
      assert.strictEqual(extractLocalFsPath(uri), "/Users/test/image.png");
    });

    it("should extract fsPath from vscode-resource.vscode-cdn.net (+)", () => {
      const uri = "https://file+.vscode-resource.vscode-cdn.net/Users/test/image.svg";
      assert.strictEqual(extractLocalFsPath(uri), "/Users/test/image.svg");
    });

    it("should extract Windows fsPath correctly", () => {
      const uri = "https://file%2B.vscode-resource.vscode-cdn.net/c%3A/Users/test/image.png";
      assert.strictEqual(extractLocalFsPath(uri), "c:/Users/test/image.png");
    });

    it("should extract fsPath from vscode-file:// URL", () => {
      const uri = "vscode-file://vscode-app/Users/test/image.webp";
      assert.strictEqual(extractLocalFsPath(uri), "/Users/test/image.webp");
    });

    it("should extract fsPath from vscode-resource: URL", () => {
      const uri = "vscode-resource:/Users/test/image.gif";
      assert.strictEqual(extractLocalFsPath(uri), "/Users/test/image.gif");
    });

    it("should extract fsPath from file:// URL", () => {
      const uri = "file:///Users/test/image.png";
      assert.strictEqual(extractLocalFsPath(uri), "/Users/test/image.png");
    });

    it("should ignore query parameters and hashes", () => {
      const uri = "https://file%2B.vscode-resource.vscode-cdn.net/Users/test/image.png?v=123#frag";
      assert.strictEqual(extractLocalFsPath(uri), "/Users/test/image.png");
    });

    it("should return undefined for non-file URLs and null bytes", () => {
      assert.strictEqual(extractLocalFsPath("https://example.com/image.png"), undefined);
      assert.strictEqual(extractLocalFsPath("data:image/png;base64,..."), undefined);
      assert.strictEqual(extractLocalFsPath("file:///path/to/test\0.png"), undefined);
    });
  });

  describe("isAllowedAsset", () => {
    it("should allow valid image and font extensions", () => {
      assert.strictEqual(isAllowedAsset("/path/to/image.png"), true);
      assert.strictEqual(isAllowedAsset("/path/to/image.SVG"), true);
      assert.strictEqual(isAllowedAsset("/path/to/font.woff2"), true);
      assert.strictEqual(isAllowedAsset("/path/to/photo.jpg"), true);
    });

    it("should reject sensitive or non-asset files", () => {
      assert.strictEqual(isAllowedAsset("/etc/passwd"), false);
      assert.strictEqual(isAllowedAsset("/Users/test/.env"), false);
      assert.strictEqual(isAllowedAsset("/Users/test/.ssh/id_rsa"), false);
      assert.strictEqual(isAllowedAsset("/Users/test/script.sh"), false);
      assert.strictEqual(isAllowedAsset("/Users/test/app.ts"), false);
      assert.strictEqual(isAllowedAsset("/path/to/image.png\0.txt"), false);
    });
  });

  describe("getMimeType", () => {
    it("should identify SVG, PNG, JPEG, GIF, WebP", () => {
      assert.strictEqual(getMimeType("test.svg"), "image/svg+xml");
      assert.strictEqual(getMimeType("test.png"), "image/png");
      assert.strictEqual(getMimeType("test.jpg"), "image/jpeg");
      assert.strictEqual(getMimeType("test.jpeg"), "image/jpeg");
      assert.strictEqual(getMimeType("test.gif"), "image/gif");
      assert.strictEqual(getMimeType("test.webp"), "image/webp");
      assert.strictEqual(getMimeType("test.woff2"), "font/woff2");
    });

    it("should return undefined for unknown or disallowed extensions", () => {
      assert.strictEqual(getMimeType("passwd"), undefined);
      assert.strictEqual(getMimeType("secret.env"), undefined);
      assert.strictEqual(getMimeType("script.js"), undefined);
    });
  });

  describe("prepareExportHtml", () => {
    it("should replace local image URIs with Base64 Data URIs", async () => {
      const mockHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none';">
</head>
<body>
  <div class="diff-image-old"><img src="https://file%2B.vscode-resource.vscode-cdn.net/Users/mock/image.svg" alt="old" /></div>
  <div class="diff-image-new"><img src="https://file%2B.vscode-resource.vscode-cdn.net/Users/mock/image.png" alt="new" /></div>
</body>
</html>`;

      const svgContent = `<svg><circle r="10"/></svg>`;
      const pngContent = Buffer.from("fake-png-bytes");

      const mockReadFile = async (filePath: string): Promise<Uint8Array> => {
        if (filePath.endsWith(".svg")) {
          return Buffer.from(svgContent, "utf8");
        }
        if (filePath.endsWith(".png")) {
          return pngContent;
        }
        throw new Error("File not found");
      };

      const result = await prepareExportHtml(mockHtml, { readFile: mockReadFile });

      // Should contain Base64 data URIs
      const expectedSvgBase64 = Buffer.from(svgContent, "utf8").toString("base64");
      const expectedPngBase64 = pngContent.toString("base64");

      assert.ok(
        result.includes(`src="data:image/svg+xml;base64,${expectedSvgBase64}"`),
        "Should replace SVG src with Base64 data URI",
      );
      assert.ok(
        result.includes(`src="data:image/png;base64,${expectedPngBase64}"`),
        "Should replace PNG src with Base64 data URI",
      );
      // CSP should be relaxed for standalone
      assert.ok(!result.includes("default-src 'none'"), "Should replace strict webview CSP");
      assert.ok(result.includes("default-src 'self'"), "Should have standalone CSP");
    });

    it("should replace KaTeX font URIs with CDN URLs", async () => {
      const mockHtml = `
<style>
@font-face {
  font-family: KaTeX_Main;
  src: url(https://file%2B.vscode-resource.vscode-cdn.net/Users/test/.vscode/extensions/media/katex/fonts/KaTeX_Main-Regular.woff2) format("woff2");
}
</style>`;

      const result = await prepareExportHtml(mockHtml, {
        readFile: async () => {
          throw new Error("Should use CDN for katex fonts");
        },
      });

      assert.ok(
        result.includes("https://cdn.jsdelivr.net/npm/katex@0.10.2/dist/fonts/KaTeX_Main-Regular.woff2"),
        "Should replace local KaTeX font with KaTeX CDN font URL",
      );
    });

    it("should replace Highlight.js and Mermaid URIs with CDN equivalents", async () => {
      const mockHtml = `
<link rel="stylesheet" href="vscode-resource://file/path/to/github.min.css">
<link rel="stylesheet" href="vscode-resource://file/path/to/github-dark.min.css">
<script src="vscode-resource://file/path/to/mermaid.min.js"></script>`;

      const result = await prepareExportHtml(mockHtml);

      assert.ok(result.includes("https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"));
      assert.ok(result.includes("https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github.min.css"));
      assert.ok(result.includes("https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github-dark.min.css"));
    });

    it("should gracefully handle missing local image files without crashing", async () => {
      const mockHtml = `<img src="https://file%2B.vscode-resource.vscode-cdn.net/Users/missing/image.png">`;

      const result = await prepareExportHtml(mockHtml, {
        readFile: async () => {
          throw new Error("File not found on disk");
        },
      });

      // Should keep original URL if reading fails
      assert.ok(result.includes("https://file%2B.vscode-resource.vscode-cdn.net/Users/missing/image.png"));
    });

    it("should not replace image filename text occurrences in markdown body", async () => {
      const uri = "https://file%2B.vscode-resource.vscode-cdn.net/Users/test/logo.png";
      const mockHtml = `
<p>Please refer to logo.png or ${uri} for details.</p>
<img src="${uri}" alt="logo.png">
`;
      const pngContent = Buffer.from("fake-logo-png");
      const result = await prepareExportHtml(mockHtml, {
        readFile: async () => pngContent,
      });

      const expectedBase64 = pngContent.toString("base64");
      assert.ok(result.includes(`src="data:image/png;base64,${expectedBase64}"`));
      assert.ok(result.includes(`alt="logo.png"`));
      assert.ok(result.includes(`<p>Please refer to logo.png or ${uri} for details.</p>`));
    });

    it("should reject inlining of non-asset or sensitive files like .env or /etc/passwd", async () => {
      const sensitiveUri = "file:///etc/passwd";
      const envUri = "file:///Users/test/.env";
      const mockHtml = `
<img src="${sensitiveUri}">
<img src="${envUri}">
`;
      let readAttempted = false;
      const result = await prepareExportHtml(mockHtml, {
        readFile: async () => {
          readAttempted = true;
          return Buffer.from("SECRET_DATA");
        },
      });

      assert.strictEqual(readAttempted, false, "readFile must not be called for non-asset files");
      assert.ok(result.includes(`src="${sensitiveUri}"`), "Sensitive file URI should remain untouched");
      assert.ok(result.includes(`src="${envUri}"`), "Env file URI should remain untouched");
      assert.strictEqual(result.includes("data:application/octet-stream"), false);
      assert.strictEqual(result.includes("SECRET_DATA"), false);
    });
  });
});
