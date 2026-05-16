import { test, expect } from "@playwright/test";

test.describe("Public marketing site", () => {
  test("landing page renders the hero, agent grid, and pricing table", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/xicmo/i);

    // Agent grid
    await expect(page.getByText("Reddit Agent")).toBeVisible();
    await expect(page.getByText("SEO Agent")).toBeVisible();
    await expect(page.getByText("GEO Agent")).toBeVisible();

    // Cost table
    await expect(page.getByText(/\$14,000/)).toBeVisible();
    await expect(page.getByText(/\$99\/mo/)).toBeVisible();
  });

  test("pricing page shows Free and Max plans", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByRole("heading", { name: /Free/i }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /Max/i }).first()).toBeVisible();
  });

  test("blog index lists posts", async ({ page }) => {
    await page.goto("/blog");
    await expect(page.getByRole("heading", { level: 1, name: /Blog/i })).toBeVisible();
    await expect(page.getByText("Welcome to Xicmo")).toBeVisible();
  });

  test("blog post renders markdown content", async ({ page }) => {
    await page.goto("/blog/welcome-to-xicmo");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Welcome to Xicmo/i);
  });

  test("legacy blog slug redirects to new post", async ({ page }) => {
    await page.goto("/blog/welcome-to-ai-cmo");
    await expect(page).toHaveURL(/\/blog\/welcome-to-xicmo/);
  });

  test("register page renders", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("heading", { name: /Create your account/i })).toBeVisible();
    await expect(page.getByLabel(/Name/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test("protected routes redirect to login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/content");
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/actions");
    await expect(page).toHaveURL(/\/login/);
  });
});
