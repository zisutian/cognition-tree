// SPDX-License-Identifier: GPL-3.0-or-later

import { expect } from "@playwright/test";
import { buildApiOperationPath } from "../contracts/api/registry";
import { seedJournalProposal } from "./support/agentSeeds";
import { test } from "./support/e2eTest";
import { seedWorkbenchRepository } from "./support/repositorySeeds";
import {
  getWorkbenchStatus, getActivityButton, openWorkbench
} from "./support/workbenchPage";

test("keeps audit selection and details together across keyboard selection and failed refresh", async ({
  api,
  page,
}) => {
  const repositoryId = "settings-audit";
  await seedWorkbenchRepository(api, repositoryId);
  for (let index = 0; index < 2; index += 1) {
    const target = await seedJournalProposal(api);
    const response = await api.post(
      buildApiOperationPath("decideAgentProposal", target),
      {
        data: { decision: "approve" },
      },
    );
    expect(response.status()).toBe(200);
  }
  const auditPath = buildApiOperationPath("listOperations");
  const { entries } = (await (await api.get(auditPath)).json()) as {
    entries: { id: string }[];
  };
  expect(entries).toHaveLength(2);
  await openWorkbench(page, repositoryId);
  await getActivityButton(page, "设置").click();
  await page
    .locator(".settings-context")
    .getByRole("button", { name: "操作记录", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "审计", exact: true });
  const rows = panel
    .getByRole("list", { name: "操作审计" })
    .getByRole("button");
  await expect(rows).toHaveCount(2);
  const detail = page.getByRole("region", { name: "设置状态" });
  const technical = detail.getByLabel("操作技术详情");
  await expect(technical).toBeHidden();
  await detail.locator("summary").click();
  await expect(technical).toContainText(entries[0]!.id);
  await rows.nth(1).focus();
  await page.keyboard.press("Enter");
  await expect(rows.nth(1)).toHaveAttribute("aria-current", "true");
  await expect(technical).toBeHidden();
  await detail.locator("summary").click();
  await expect(technical).toContainText(entries[1]!.id);
  await page.route(`**${auditPath}*`, (route) => route.abort());
  await panel.getByRole("button", { name: "刷新", exact: true }).click();
  await expect(panel.getByRole("alert")).toBeVisible();
  await expect(getWorkbenchStatus(page)).toContainText("设置 ·");
  await expect(rows.nth(1)).toHaveAttribute("aria-current", "true");
  await expect(technical).toContainText(entries[1]!.id);
});
