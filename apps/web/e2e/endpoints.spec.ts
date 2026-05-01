import { test, expect } from "@playwright/test";

test.describe("Endpoints page", () => {
  test("renders the endpoints page with DataTable or EmptyState", async ({
    page,
  }) => {
    await page.goto("/endpoints");
    await expect(
      page.getByRole("heading", { name: /endpoints/i })
    ).toBeVisible();

    const hasTable = await page
      .locator("table")
      .isVisible()
      .catch(() => false);
    const hasEmpty = await page
      .getByText("No endpoints yet")
      .isVisible()
      .catch(() => false);

    expect(hasTable || hasEmpty).toBe(true);
  });

  test("shows alert when no project key is set", async ({ page }) => {
    await page.evaluate(() => localStorage.removeItem("wm_active_project"));
    await page.goto("/endpoints");
    await expect(page.getByRole("alert")).toBeVisible();
  });

  test("create and delete endpoint flow", async ({ page }) => {
    await page.goto("/endpoints");

    const uniqueName = `E2E Endpoint ${Date.now()}`;
    const uniqueUrl = `https://webhook.example.com/test-${Date.now()}`;

    await page.getByRole("button", { name: "New Endpoint" }).click();
    await page.getByLabel("Name").fill(uniqueName);
    await page.getByLabel("URL").fill(uniqueUrl);
    await page.getByRole("button", { name: "Create" }).click();

    await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 5000 });

    await page
      .getByRole("row", { name: new RegExp(uniqueName) })
      .getByRole("button", { name: "Delete" })
      .click();

    await expect(
      page.getByRole("alertdialog").getByText(new RegExp(uniqueName))
    ).toBeVisible();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete" })
      .click();

    await expect(page.getByText(uniqueName)).not.toBeVisible({ timeout: 5000 });
  });

  test("shows field-level error for invalid URL", async ({ page }) => {
    await page.goto("/endpoints");
    await page.getByRole("button", { name: "New Endpoint" }).click();
    await page.getByLabel("Name").fill("Test");
    await page.getByLabel("URL").fill("not-a-url");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText(/valid url|invalid url/i)).toBeVisible({
      timeout: 3000,
    });
  });

  test("endpoint name links to events page", async ({ page }) => {
    await page.goto("/endpoints");
    const firstLink = page.locator("table a").first();
    const href = await firstLink.getAttribute("href");
    expect(href).toMatch(/\/endpoints\/.+\/events/);
  });
});
