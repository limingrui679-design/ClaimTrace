import { expect, test, type Page } from "@playwright/test";

async function expectNoMutationControls(page: Page) {
  await expect(page.locator("[data-claimtrace-mutation]")).toHaveCount(0);
  await expect(page.locator("[data-claimtrace-mutation]:enabled")).toHaveCount(0);
}

async function expectInsideViewport(page: Page, buttonName: string) {
  const button = page.getByRole("button", { name: buttonName, exact: true });
  await expect(button).toBeVisible();
  const box = await button.boundingBox();
  const viewportWidth = page.viewportSize()?.width ?? 0;
  expect(box, `${buttonName} must have a rendered bounding box`).not.toBeNull();
  expect(box!.x, `${buttonName} must start inside the viewport`).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `${buttonName} must end inside the viewport`).toBeLessThanOrEqual(viewportWidth);
  return button;
}

test("public build renders no import, claim, review, or sign-off controls", async ({ page }) => {
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "unknown failure"}`));

  await page.goto("/");
  await expect(page.getByText("Read-only portfolio mode · controls disabled")).toBeVisible();
  await expect(page.getByTestId("build-receipt")).toContainText("v0.10.2");
  await expect(page.getByTestId("build-receipt")).toContainText("commit readonl · read-only");
  await expect(page.locator(".executive-brief")).toBeVisible();
  await expect(page.locator(".status-mix-track").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Import your project" })).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expectNoMutationControls(page);

  const caseCards = page.locator(".case-library article");
  await expect(caseCards).toHaveCount(10);
  await expect(caseCards.filter({ hasText: "Synthetic data" })).toHaveCount(4);
  await expect(caseCards.filter({ hasText: "External public data" })).toHaveCount(6);
  for (let index = 0; index < 10; index += 1) {
    const card = caseCards.nth(index);
    await card.getByRole("button", { name: /Load and audit|Rerun case/ }).click();
    await expect(card).toHaveClass(/active/);
    await expect(card.getByRole("button", { name: "Rerun case" })).toBeVisible();
    await expect(page.locator(".case-library article.active")).toHaveCount(1);
  }

  await page.getByRole("button", { name: /Data Versions/ }).click();
  await expect(page.locator(".diff-intelligence")).toBeVisible();
  await expect(page.getByRole("button", { name: "Import new project" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Import current CSV/ })).toHaveCount(0);
  await expectNoMutationControls(page);

  await page.getByRole("button", { name: /Claim Rules/ }).click();
  await expect(page.locator(".claim-portfolio-summary")).toBeVisible();
  await expect(page.getByRole("button", { name: /Add testable claim/ })).toHaveCount(0);
  await expectNoMutationControls(page);

  await page.getByRole("button", { name: /Human Review/ }).click();
  await expect(page.locator(".governance-pipeline")).toBeVisible();
  await expect(page.getByText("Review and sign-off controls are disabled. The content below displays governance state and existing records only.")).toBeVisible();
  await expect(page.locator(".review-identity, .review-actions, .review-queue textarea")).toHaveCount(0);
  await expectNoMutationControls(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expectNoMutationControls(page);

  const mobileRoutes = [
    { name: "Project Audit", heading: "Every claim should explain why it holds.", visual: ".executive-brief" },
    { name: "Data Versions", heading: "Data Versions and Changes", visual: ".diff-intelligence" },
    { name: "Claim Rules", heading: "Claims and Evidence", visual: ".claim-portfolio-summary" },
    { name: "Decision Impact", heading: "Does the change actually alter the action?", visual: ".decision-portfolio" },
    { name: "Human Review", heading: "Human Review and Locally Recorded, Unauthenticated Sign-Offs", visual: ".governance-pipeline" },
    { name: "Audit Export", heading: "Audit Report", visual: ".report-sheet" },
  ];

  for (const route of mobileRoutes) {
    const button = await expectInsideViewport(page, route.name);
    await button.click();
    await expect(button).toHaveClass(/active/);
    await expect(page.getByRole("heading", { level: 1, name: route.heading, exact: true })).toBeVisible();
    await expect(page.locator(route.visual).first()).toBeVisible();
    const horizontalFit = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(horizontalFit.documentWidth, `${route.name} must not overflow the ${horizontalFit.viewportWidth}px viewport`).toBeLessThanOrEqual(horizontalFit.viewportWidth);
  }

  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});
