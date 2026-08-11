import { readFile } from "node:fs/promises";
import { expect, test, type Download, type Page } from "@playwright/test";
import {
  verifyAuditBundleChain,
  verifyEvidencePackage,
  type AuditBundle,
} from "../../src/core";

const baselineCsv = "id,a,b\n1,10,20\n2,15,25\n";
const currentReorderedCsv = "b,id,a\n20,1,10\n30,2,16\n";
const worldBankProject = "World Bank WDI Eight-Country Life-Expectancy Audit";
const treasuryProject = "U.S. Treasury Year-End Par Yield Curve Audit";
const transitProject = "USDOT NTD Selected Heavy-Rail Operations Audit";

async function downloadedText(download: Download) {
  const filePath = await download.path();
  if (!filePath) throw new Error(`Download ${download.suggestedFilename()} has no local path`);
  return readFile(filePath, "utf8");
}

function caseCard(page: Page, title: RegExp) {
  return page.locator(".case-library article").filter({ hasText: title });
}

async function delayFileRead(page: Page, fileName: string, delayMs: number) {
  await page.evaluate(({ targetName, waitMs }) => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = function delayedArrayBuffer() {
      const result = original.call(this);
      if (this.name !== targetName) return result;
      return new Promise<ArrayBuffer>((resolve, reject) => {
        window.setTimeout(() => result.then(resolve, reject), waitMs);
      });
    };
  }, { targetName: fileName, waitMs: delayMs });
}

async function blockNextDigest(page: Page) {
  await page.evaluate(() => {
    const subtle = globalThis.crypto.subtle;
    const original = subtle.digest.bind(subtle);
    let releaseDigest = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseDigest = resolve;
    });
    Reflect.set(globalThis, "__claimtraceReleaseDigest", releaseDigest);
    let first = true;
    document.documentElement.dataset.claimtraceDigestDelay = "armed";
    Object.defineProperty(subtle, "digest", {
      configurable: true,
      value: async (algorithm: AlgorithmIdentifier, data: BufferSource) => {
        if (first) {
          first = false;
          Object.defineProperty(subtle, "digest", { configurable: true, value: original });
          document.documentElement.dataset.claimtraceDigestDelay = "blocked";
          await gate;
          document.documentElement.dataset.claimtraceDigestDelay = "released";
        }
        return original(algorithm, data);
      },
    });
  });
}

async function releaseBlockedDigest(page: Page) {
  await page.evaluate(() => {
    const releaseDigest = Reflect.get(globalThis, "__claimtraceReleaseDigest") as (() => void) | undefined;
    if (!releaseDigest) throw new Error("No blocked digest is waiting for release");
    releaseDigest();
  });
}

async function openImport(page: Page) {
  await page.locator('[data-claimtrace-mutation="import-project"]').first().click();
  await expect(page.getByRole("dialog", { name: "Import Your Analytical Project" })).toBeVisible();
}

async function importProject(page: Page, projectName: string, includeFileRace = false) {
  await openImport(page);
  const baselineInput = page.locator(".file-drop input").nth(0);
  if (includeFileRace) {
    await delayFileRead(page, "slow-invalid.csv", 500);
    await baselineInput.setInputFiles({
      name: "slow-invalid.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("id,a,b\n1,10,20\n1,15,25\n"),
    });
  }
  await baselineInput.setInputFiles({
    name: "baseline.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(baselineCsv),
  });
  if (includeFileRace) await page.waitForTimeout(650);
  await expect(page.locator(".form-error")).toHaveCount(0);
  await expect(page.locator(".key-picker")).toBeVisible();
  await expect(page.locator(".file-drop").nth(0)).toContainText("baseline.csv");
  await page.locator(".file-drop input").nth(1).setInputFiles({
    name: "current-reordered.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(currentReorderedCsv),
  });
  await page.getByLabel("Project name").fill(projectName);
  await page.getByLabel("Unique primary key (required)").selectOption("id");
  await page.getByRole("button", { name: "Validate key and create" }).click();
  await expect(page.getByRole("dialog", { name: "Import Your Analytical Project" })).toHaveCount(0);
  await expect(page.locator(".sidebar-project strong")).toHaveText(projectName);
}

test("writable flow enforces global dataset intent, serial operations, and independently verifiable exports", async ({ page }) => {
  const pageErrors: string[] = [];
  const downloads: Download[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("download", (download) => downloads.push(download));
  await page.route("**/cases/business-operations/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.continue();
  });

  await page.goto("/");
  await expect(page.getByText("Read-only portfolio mode · controls disabled")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Import your project" })).toBeVisible();

  const business = caseCard(page, /Business Operations: Channel Conversion/);
  const worldBank = caseCard(page, /World Bank Life-Expectancy/);
  const treasury = caseCard(page, /Treasury Yield-Curve/);
  const transit = caseCard(page, /USDOT Transit Operations/);

  await test.step("the latest case selection wins", async () => {
    await business.getByRole("button", { name: "Load and audit" }).click();
    await worldBank.getByRole("button", { name: "Load and audit" }).click();
    await expect(worldBank).toHaveClass(/active/);
    await page.waitForTimeout(900);
    await expect(worldBank).toHaveClass(/active/);
    await expect(business).not.toHaveClass(/active/);
  });

  await test.step("a later project import cancels an older case load", async () => {
    await business.getByRole("button", { name: "Load and audit" }).click();
    await importProject(page, "Cross-flow import wins");
    await page.waitForTimeout(900);
    await expect(page.locator(".sidebar-project strong")).toHaveText("Cross-flow import wins");
    await expect(business).not.toHaveClass(/active/);
  });

  await test.step("restoring the demo cancels an older case load", async () => {
    await business.getByRole("button", { name: "Load and audit" }).click();
    await page.getByRole("button", { name: "Restore demo project" }).click();
    await expect(page.locator(".sidebar-project strong")).toHaveText("Community Chronic-Disease Follow-Up Prioritization");
    await page.waitForTimeout(900);
    await expect(page.locator(".sidebar-project strong")).toHaveText("Community Chronic-Disease Follow-Up Prioritization");
  });

  await test.step("a later case load invalidates an unfinished import-file read", async () => {
    await openImport(page);
    await delayFileRead(page, "slow-preview.csv", 800);
    await page.locator(".file-drop input").nth(0).setInputFiles({
      name: "slow-preview.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(baselineCsv),
    });
    await page.getByRole("button", { name: "Close" }).click();
    await worldBank.getByRole("button", { name: "Load and audit" }).click();
    await expect(page.locator(".sidebar-project strong")).toHaveText(worldBankProject);
    await page.waitForTimeout(900);
    await openImport(page);
    await expect(page.locator(".key-picker")).toHaveCount(0);
    await page.getByRole("button", { name: "Cancel" }).click();
  });

  await test.step("a later case load invalidates an unfinished revision read", async () => {
    await importProject(page, "Revision intent source");
    await page.getByRole("button", { name: "Data Versions" }).click();
    await delayFileRead(page, "slow-revision.csv", 900);
    await page.locator('input[data-claimtrace-mutation="import-revision"]').setInputFiles({
      name: "slow-revision.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("id,a,b\n1,11,20\n2,16,30\n"),
    });
    await page.getByRole("button", { name: "Project Audit" }).click();
    await worldBank.getByRole("button", { name: "Load and audit" }).click();
    await expect(page.locator(".sidebar-project strong")).toHaveText(worldBankProject);
    await page.waitForTimeout(1_050);
    await expect(page.locator(".sidebar-project strong")).toHaveText(worldBankProject);
  });

  await test.step("a stale review cannot append to a replacement dataset", async () => {
    await importProject(page, "Review isolation source");
    await page.getByRole("button", { name: "Human Review" }).click();
    await page.getByLabel("Reviewer display name (identity not verified)").fill("Cross-flow reviewer");
    await page.locator('[data-claimtrace-mutation="claim-review-note"]').first().fill("Return pending threshold provenance after isolated review");
    await blockNextDigest(page);
    await page.locator('[data-claimtrace-mutation="claim-return"]').first().evaluate((button: HTMLButtonElement) => button.click());
    await expect(page.locator("html")).toHaveAttribute("data-claimtrace-digest-delay", "blocked");
    await page.getByRole("button", { name: "Project Audit" }).click();
    await treasury.getByRole("button", { name: "Load and audit" }).click();
    await releaseBlockedDigest(page);
    await expect(page.locator(".sidebar-project strong")).toHaveText(treasuryProject);
    await expect(page.getByRole("status", { name: "Operation in progress" })).toHaveCount(0, { timeout: 5_000 });
    await page.getByRole("button", { name: "Human Review" }).click();
    await expect(page.locator(".audit-log li")).toHaveCount(0);
  });

  await test.step("a stale export cannot download or seed the replacement dataset chain", async () => {
    await page.getByRole("button", { name: "Project Audit" }).click();
    const downloadsBeforeStaleExport = downloads.length;
    await blockNextDigest(page);
    await page.getByRole("button", { name: "Export AuditBundle" }).evaluate((button: HTMLButtonElement) => button.click());
    await expect(page.locator("html")).toHaveAttribute("data-claimtrace-digest-delay", "blocked");
    await transit.getByRole("button", { name: "Load and audit" }).click();
    await releaseBlockedDigest(page);
    await expect(page.locator(".sidebar-project strong")).toHaveText(transitProject);
    await expect(page.getByRole("status", { name: "Operation in progress" })).toHaveCount(0, { timeout: 5_000 });
    expect(downloads).toHaveLength(downloadsBeforeStaleExport);

    const replacementDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export AuditBundle" }).click();
    const replacementBundle = JSON.parse(await downloadedText(await replacementDownloadPromise)) as AuditBundle;
    expect(replacementBundle.project).toBe(transitProject);
    expect(replacementBundle.previousBundleHash).toBeNull();
    expect((await verifyEvidencePackage(replacementBundle)).valid).toBe(true);
  });

  await test.step("normal writable review and exports remain serial and verifiable", async () => {
    await importProject(page, "Writable browser acceptance", true);
    await page.getByRole("button", { name: "Data Versions" }).click();
    await expect(page.getByText("SHA-256 verified")).toHaveCount(2);

    await page.getByRole("button", { name: "Human Review" }).click();
    await page.getByLabel("Reviewer display name (identity not verified)").fill("Independent browser reviewer");
    await page.locator('[data-claimtrace-mutation="claim-review-note"]').first().fill("Return pending threshold provenance for documented revision");
    await page.locator('[data-claimtrace-mutation="claim-return"]').first().evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await expect(page.locator(".audit-log li")).toHaveCount(1);

    const downloadsBeforeChain = downloads.length;
    const firstDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export AuditBundle" }).evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    const firstDownload = await firstDownloadPromise;
    await expect.poll(() => downloads.length).toBe(downloadsBeforeChain + 1);
    const firstBundle = JSON.parse(await downloadedText(firstDownload)) as AuditBundle;
    expect((await verifyEvidencePackage(firstBundle)).valid).toBe(true);
    expect(firstBundle.previousBundleHash).toBeNull();

    const secondDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export AuditBundle" }).click();
    const secondBundle = JSON.parse(await downloadedText(await secondDownloadPromise)) as AuditBundle;
    expect(secondBundle.previousBundleHash).toBe(firstBundle.integrity.payloadHash);
    expect((await verifyAuditBundleChain([firstBundle, secondBundle])).valid).toBe(true);

    await page.getByRole("button", { name: "Audit Export" }).click();
    const htmlDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download complete HTML report" }).click();
    const html = await downloadedText(await htmlDownloadPromise);
    expect(html).toContain("PASS · bundle-root");
    expect(html).toContain("PASS · section-hashes");
    expect(html).not.toMatch(/PASS · bundle-root<\/b><span>[^<]*mismatch/i);
    expect(html).not.toMatch(/PASS · section-hashes<\/b><span>[^<]*mismatch/i);
  });

  expect(pageErrors).toEqual([]);
});
