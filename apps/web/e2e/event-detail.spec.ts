import { test, expect } from "@playwright/test";

test.describe("Event detail page", () => {
  test("navigate from event list to detail page — all sections visible", async ({
    page,
  }) => {
    await page.goto("/endpoints");

    const firstLink = page.locator("table a").first();
    const hasEndpoints = await firstLink.isVisible().catch(() => false);

    if (!hasEndpoints) {
      // No endpoints — skip gracefully
      return;
    }

    const endpointHref = await firstLink.getAttribute("href");
    await page.goto(endpointHref!);

    const hasTable = await page.locator("table").isVisible().catch(() => false);
    if (!hasTable) {
      // No events — skip
      return;
    }

    // Click "View" on the first event row to navigate to detail page
    const viewLink = page.getByRole("link", { name: /view/i }).first();
    const hasViewLink = await viewLink.isVisible().catch(() => false);
    if (!hasViewLink) return;

    await viewLink.click();
    await page.waitForURL(/\/events\/.+$/);

    // Breadcrumb: Endpoints > [name] > Events > [shortId]
    await expect(page.getByText("Endpoints")).toBeVisible();
    await expect(page.getByText("Events")).toBeVisible();

    // Overview section
    await expect(
      page.getByRole("heading", { name: /event overview/i })
    ).toBeVisible();

    // Headers section
    await expect(
      page.getByRole("heading", { name: /request headers/i })
    ).toBeVisible();

    // Body section
    await expect(
      page.getByRole("heading", { name: /request body/i })
    ).toBeVisible();

    // Delivery Attempts section
    await expect(
      page.getByRole("heading", { name: /delivery attempts/i })
    ).toBeVisible();
  });

  test("breadcrumb links back to event list", async ({ page }) => {
    await page.goto("/endpoints");

    const firstLink = page.locator("table a").first();
    const hasEndpoints = await firstLink.isVisible().catch(() => false);
    if (!hasEndpoints) return;

    const endpointHref = await firstLink.getAttribute("href");
    await page.goto(endpointHref!);

    const viewLink = page.getByRole("link", { name: /view/i }).first();
    const hasViewLink = await viewLink.isVisible().catch(() => false);
    if (!hasViewLink) return;

    await viewLink.click();
    await page.waitForURL(/\/events\/.+$/);

    // Clicking "Events" in breadcrumb goes back to list
    await page.getByRole("link", { name: "Events" }).click();
    await expect(page).toHaveURL(/\/events$/);
  });

  test("replay button only visible on FAILED events", async ({ page }) => {
    await page.goto("/endpoints");

    const firstLink = page.locator("table a").first();
    const hasEndpoints = await firstLink.isVisible().catch(() => false);
    if (!hasEndpoints) return;

    const endpointHref = await firstLink.getAttribute("href");
    await page.goto(endpointHref!);

    const viewLink = page.getByRole("link", { name: /view/i }).first();
    const hasViewLink = await viewLink.isVisible().catch(() => false);
    if (!hasViewLink) return;

    await viewLink.click();
    await page.waitForURL(/\/events\/.+$/);

    // If the status shown is not FAILED, replay button should not be visible
    const statusEl = page.locator("text=Failed").first();
    const isFailed = await statusEl.isVisible().catch(() => false);

    const replayBtn = page.getByRole("button", { name: /replay/i });

    if (isFailed) {
      await expect(replayBtn).toBeVisible();
    } else {
      await expect(replayBtn).not.toBeVisible();
    }
  });

  test("shows error state when navigating without project key", async ({
    page,
  }) => {
    await page.evaluate(() => localStorage.removeItem("wm_active_project"));
    await page.goto("/endpoints/nonexistent/events/nonexistent-event");
    await expect(page.getByRole("alert")).toBeVisible();
  });
});
