import { expect } from "@playwright/test";
import { test } from "../support/e2eTest";

test("keeps the shared login form stable through loading, failure and retry", async ({
  page,
}, testInfo) => {
  // A synthetic public session exercises the auth presentation without changing server credentials.
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let attempts = 0;
  await page.route("**/api/v4/auth/session", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { authenticated: false } });
      return;
    }
    attempts += 1;
    if (attempts === 1) {
      await held;
      await route.fulfill({
        status: 503,
        json: {
          code: "internal_error",
          details: {},
          message: "登录服务暂时不可用",
          requestId: "synthetic-owner-login",
          retryable: false,
        },
      });
    } else {
      await route.fulfill({ json: { authenticated: true } });
    }
  });
  try {
    await page.goto("/");
    const secret = page.getByLabel("所有者密钥", { exact: true });
    const submit = page.getByRole("button", { name: "登录", exact: true });
    await expect(secret).toBeVisible();
    const field = (await secret.boundingBox())!;
    const action = (await submit.boundingBox())!;
    expect(field.height).toBe(22);
    expect(field.width).toBe(720);
    expect(action.height).toBe(22);
    expect(action.x + action.width).toBe(field.x + field.width);
    await secret.fill("synthetic-login-secret");
    await secret.press("Enter");
    await expect(submit).toBeDisabled();
    await expect(secret).toBeVisible();
    await expect(secret).toHaveValue("synthetic-login-secret");
    expect((await secret.boundingBox())!.y).toBe(field.y);
    release();
    await expect(page.getByRole("alert")).toContainText("登录服务暂时不可用");
    await expect(submit).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath("login-error.png") });
    await submit.click();
    await expect(
      page.getByRole("navigation", { name: "工作区功能" }),
    ).toBeVisible();
    expect(attempts).toBe(2);
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
});
