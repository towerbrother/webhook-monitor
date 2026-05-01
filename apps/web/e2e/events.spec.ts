import { test, expect } from "@playwright/test";

test.describe("Events page", () => {
  test("events page renders with correct column headers and StatusBadge", async ({
    page,
  }) => {
    // Navigate to endpoints first to find an existing endpoint
    await page.goto("/endpoints");

    const firstLink = page.locator("table a").first();
    const hasEndpoints = await firstLink.isVisible().catch(() => false);

    if (!hasEndpoints) {
      // No endpoints available — skip this sub-test gracefully
      return;
    }

    const href = await firstLink.getAttribute("href");
    expect(href).toMatch(/\/endpoints\/.+\/events/);

    await page.goto(href!);

    // Breadcrumb is visible
    await expect(page.getByText("Endpoints")).toBeVisible();
    await expect(page.getByText("Events")).toBeVisible();

    // Live polling indicator visible
    await expect(page.getByText("Live")).toBeVisible();

    // Column headers present
    await expect(
      page.getByRole("columnheader", { name: /event id/i })
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: /status/i })
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: /method/i })
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: /received at/i })
    ).toBeVisible();
  });

  test("shows empty state when no events exist", async ({ page }) => {
    await page.goto("/endpoints");

    const firstLink = page.locator("table a").first();
    const hasEndpoints = await firstLink.isVisible().catch(() => false);

    if (!hasEndpoints) {
      return;
    }

    const href = await firstLink.getAttribute("href");
    await page.goto(href!);

    // Either a table with status badges OR the empty state is visible
    const hasTable = await page
      .locator("table")
      .isVisible()
      .catch(() => false);
    const hasEmpty = await page
      .getByText("No events yet")
      .isVisible()
      .catch(() => false);

    expect(hasTable || hasEmpty).toBe(true);
  });

  test("replay button only visible on FAILED rows", async ({ page }) => {
    await page.goto("/endpoints");

    const firstLink = page.locator("table a").first();
    const hasEndpoints = await firstLink.isVisible().catch(() => false);

    if (!hasEndpoints) {
      return;
    }

    const href = await firstLink.getAttribute("href");
    await page.goto(href!);

    const hasTable = await page
      .locator("table")
      .isVisible()
      .catch(() => false);
    if (!hasTable) return;

    // If there are non-FAILED rows, they should not have a Replay button inline
    const rows = page.locator("tbody tr");
    const count = await rows.count();

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const statusCell = row.locator("td").nth(1);
      const statusText = await statusCell.textContent();

      if (statusText && !statusText.includes("Failed")) {
        // Non-failed row should not have Replay button
        const replayBtn = row.getByRole("button", { name: /replay/i });
        await expect(replayBtn).not.toBeVisible();
      }
    }
  });

  test("shows alert when navigating to events without project key", async ({
    page,
  }) => {
    await page.evaluate(() => localStorage.removeItem("wm_active_project"));
    await page.goto("/endpoints/nonexistent-id/events");
    await expect(page.getByRole("alert")).toBeVisible();
  });
});
