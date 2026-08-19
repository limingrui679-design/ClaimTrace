import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artworkPath = resolve(
  root,
  "docs/readme/social-card-artwork-v0.11.0.png",
);
const outputPath = resolve(root, "public/og.png");
const artwork = (await readFile(artworkPath)).toString("base64");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});

await page.setContent(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      html, body { width: 1200px; height: 630px; margin: 0; overflow: hidden; }
      body {
        color: #f4fbff;
        font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont,
          "Segoe UI", sans-serif;
        background:
          linear-gradient(90deg, rgba(3, 15, 28, 0.99) 0%, rgba(3, 15, 28, 0.96) 28%, rgba(3, 15, 28, 0.58) 53%, rgba(3, 15, 28, 0.03) 82%),
          linear-gradient(0deg, rgba(3, 15, 28, 0.32), rgba(3, 15, 28, 0.04)),
          url("data:image/png;base64,${artwork}") center / cover no-repeat;
      }
      main {
        width: 618px;
        height: 100%;
        padding: 64px 0 58px 68px;
        display: flex;
        flex-direction: column;
      }
      .eyebrow {
        align-self: flex-start;
        margin-bottom: 28px;
        padding: 9px 14px;
        border: 1px solid rgba(100, 226, 220, 0.46);
        border-radius: 999px;
        color: #8ce9e3;
        background: rgba(8, 41, 55, 0.72);
        font-size: 15px;
        font-weight: 760;
        letter-spacing: 0.12em;
        line-height: 1;
      }
      h1 {
        margin: 0 0 22px;
        color: #ffffff;
        font-size: 66px;
        font-weight: 780;
        letter-spacing: -0.048em;
        line-height: 0.96;
      }
      h1 span { color: #73e0db; }
      .lead {
        width: 520px;
        margin: 0;
        color: #e9f4f8;
        font-size: 27px;
        font-weight: 620;
        letter-spacing: -0.018em;
        line-height: 1.28;
      }
      .detail {
        width: 520px;
        margin: 18px 0 0;
        color: #adc3ce;
        font-size: 17px;
        font-weight: 500;
        line-height: 1.5;
      }
      .flow {
        margin-top: auto;
        color: #f3bd5f;
        font-size: 15px;
        font-weight: 740;
        letter-spacing: 0.045em;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="eyebrow">OPEN SOURCE · LOCAL FIRST</div>
      <h1>Claim<span>Trace</span></h1>
      <p class="lead">Know when refreshed data changes what you can claim—or decide.</p>
      <p class="detail">Compare data versions, rerun executable claims and decision rules, then export independently verifiable evidence.</p>
      <div class="flow">VERSIONED DATA → CLAIMS → DECISIONS → AUDITBUNDLE</div>
    </main>
  </body>
</html>`);

await page.screenshot({ path: outputPath, type: "png" });
await browser.close();

console.log(`Rendered ${outputPath}`);
