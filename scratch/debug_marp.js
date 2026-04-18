const { MarkdownDiffProvider } = require("./out/markdownDiff");
const fs = require("fs");
const path = require("path");

async function debug() {
    const provider = new MarkdownDiffProvider();
    await provider.waitForReady();

    const v1 = fs.readFileSync("./fixtures/marp_v1.md", "utf-8");
    const v2 = fs.readFileSync("./fixtures/marp_v2.md", "utf-8");

    const { html, marpCss, marpJs } = provider.computeDiff(v1, v2);
    
    // Simplistic version of getWebviewContent but sufficient for inspecting the body
    const fullHtml = provider.getWebviewContent(
        html, 
        "", "", "", "", 
        "Original", "Modified", 
        "*", {}, 
        marpCss, marpJs
    );

    fs.writeFileSync("./scratch/debug_marp.html", fullHtml);
    console.log("Written debug HTML to scratch/debug_marp.html");
}

debug();
