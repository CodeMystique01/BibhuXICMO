import { test, expect } from "@playwright/test";

test.describe("Auth pages and health API", () => {
  test("health endpoint returns JSON", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, service: "xicmo" });
    expect(typeof body.ts).toBe("string");
  });

  test("login page shows email sign-in", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /Welcome back/i })).toBeVisible();
    await expect(page.getByLabel(/Email/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Sign in$/i })).toBeVisible();
  });

  test("forgot password page shows form", async ({ page }) => {
    await page.goto("/forgot");
    await expect(page.getByRole("heading", { name: /Reset your password/i })).toBeVisible();
    await expect(page.getByLabel(/Email/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Send reset link/i })).toBeVisible();
  });

  test("reset password page handles missing token", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByRole("heading", { name: /Invalid link/i })).toBeVisible();
  });
});
