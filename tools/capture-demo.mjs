import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const baseURL = process.env.CLAIMTRACE_CAPTURE_URL ?? "http://127.0.0.1:4173";
const output = resolve(process.env.CLAIMTRACE_CAPTURE_OUTPUT ?? "docs/claimtrace-demo.gif");
const width = 1200;
const height = 675;
const delay = 1500;

await mkdir(dirname(output), { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const frames = [];

async function capture() {
  await page.waitForTimeout(250);
  frames.push(await page.screenshot({ type: "png", animations: "disabled" }));
}

try {
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await capture();

  for (const name of ["Data Versions", "Claim Rules", "Decision Impact", "Human Review", "Audit Export"]) {
    await page.getByRole("button", { name }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await capture();
  }

  await page.getByRole("button", { name: "Project Audit" }).click();
  await page.locator(".case-library").scrollIntoViewIfNeeded();
  await capture();
} finally {
  await browser.close();
}

const animation = sharp({
  create: {
    width,
    height: height * frames.length,
    channels: 4,
    background: { r: 245, g: 247, b: 245, alpha: 1 },
    pageHeight: height,
  },
}).composite(frames.map((input, index) => ({ input, left: 0, top: index * height })));

await animation.gif({ delay: Array(frames.length).fill(delay), loop: 0, effort: 7, colours: 128 }).toFile(output);
process.stdout.write(`${output}\n${frames.length} frames\n`);
