import { readFile } from "node:fs/promises";
import { expect, test, type Download, type Page } from "@playwright/test";
import {
  verifyAuditBundleChain,
  verifyEvidencePackage,
  type AuditBundle,
} from "../../src/core";

async function downloadedText(download: Download) {
  const filePath = await download.path();
  if (!filePath) throw new Error(`Download ${download.suggestedFilename()} has no local path`);
  return readFile(filePath, "utf8");
}

function caseCard(page: Page, title: RegExp) {
  return page.locator(".case-library article").filter({ hasText: title });
}

test("writable flow is last-intent-wins, serial, and independently verifiable", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/cases/business-operations/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.continue();
  });

  await page.goto("/");
  await expect(page.getByText("Read-only portfolio mode · controls disabled")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Import your project" })).toBeVisible();

  const business = caseCard(page, /Business Operations: Channel Conversion/);
  const worldBank = caseCard(page, /World Bank Life-Expectancy/);
  await business.getByRole("button", { name: "Load and audit" }).click();
  await worldBank.getByRole("button", { name: "Load and audit" }).click();
  await expect(worldBank).toHaveClass(/active/);
  await page.waitForTimeout(900);
  await expect(worldBank).toHaveClass(/active/);
  await expect(business).not.toHaveClass(/active/);

  await page.getByRole("button", { name: "Import your project" }).click();
  await expect(page.getByRole("dialog", { name: "Import Your Analytical Project" })).toBeVisible();
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = function delayedArrayBuffer() {
      const result = original.call(this);
      if (this.name !== "slow-invalid.csv") return result;
      return new Promise<ArrayBuffer>((resolve, reject) => {
        window.setTimeout(() => result.then(resolve, reject), 500);
      });
    };
  });

  const baselineInput = page.locator(".file-drop input").nth(0);
  await baselineInput.setInputFiles({
    name: "slow-invalid.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("id,a,b\n1,10,20\n1,15,25\n"),
  });
  await baselineInput.setInputFiles({
    name: "baseline.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("id,a,b\n1,10,20\n2,15,25\n"),
  });
  await page.waitForTimeout(650);
  await expect(page.locator(".form-error")).toHaveCount(0);
  await expect(page.locator(".key-picker")).toBeVisible();
  await expect(page.locator(".file-drop").nth(0)).toContainText("baseline.csv");

  await page.locator(".file-drop input").nth(1).setInputFiles({
    name: "current-reordered.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("b,id,a\n20,1,10\n30,2,16\n"),
  });
  await page.getByLabel("Project name").fill("Writable browser acceptance");
  await page.getByLabel("Unique primary key (required)").selectOption("id");
  await page.getByRole("button", { name: "Validate key and create" }).click();
  await expect(page.getByText(/Created \d+ evidence chains using primary key id/)).toBeVisible();
  await expect(page.locator(".sidebar-project strong")).toHaveText("Writable browser acceptance");
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

  const downloads: Download[] = [];
  page.on("download", (download) => downloads.push(download));
  const firstDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export AuditBundle" }).evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  const firstDownload = await firstDownloadPromise;
  await expect.poll(() => downloads.length).toBe(1);
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
  expect(pageErrors).toEqual([]);
});
