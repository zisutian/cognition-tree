// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { LocalRepositoryRootLease } from
  "../../infrastructure/server/repository/workspace/local/localRepositoryRootLease.ts";
import { test } from "../support/e2eTest";
import { startE2EWorkspaceServer } from "../support/workspaceServer.ts";

function waitForHmrConnection(page: Page) {
  return page.waitForEvent("websocket").then(async (socket) => {
    await socket.waitForEvent("framereceived", {
      predicate: (frame) => frame.payload.includes('"type":"connected"'),
    });
    return socket;
  });
}

async function waitForClose(closing: Promise<void>, timeoutMilliseconds: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const deadline = new Promise<"timed-out">((resolve) => {
    timer = setTimeout(() => resolve("timed-out"), timeoutMilliseconds);
  });

  try {
    return await Promise.race([closing.then(() => "closed" as const), deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

test("closes open HMR pages before releasing the repository writer lease", async ({ page }) => {
  const rootDirectory = await mkdtemp(path.join(os.tmpdir(), "ctn-shutdown-hmr-"));
  const server = await startE2EWorkspaceServer({ rootDirectory });
  let closing: Promise<void> | null = null;
  const secondPage = await page.context().newPage();

  try {
    const connected = waitForHmrConnection(page);
    const secondConnected = waitForHmrConnection(secondPage);
    const fixtureUrl = `${server.baseUrl}/e2e/fixtures/problems-virtual.html`;

    await page.goto(fixtureUrl);
    await secondPage.goto(fixtureUrl);
    const [socket, secondSocket] = await Promise.all([
      connected,
      secondConnected,
    ]);

    expect(socket.url()).toContain(server.baseUrl.replace("http:", "ws:"));
    expect(secondSocket.url()).toContain(server.baseUrl.replace("http:", "ws:"));
    closing = server.close();
    const closeState = await waitForClose(closing, 2_000);

    expect(closeState, "an open Vite HMR socket must not hold the writer lease")
      .toBe("closed");
    const competingLease = new LocalRepositoryRootLease(server.repositoryDirectory);

    try {
      await competingLease.initialize();
    } finally {
      await competingLease.dispose();
    }
  } finally {
    await secondPage.close();
    await page.close();
    await server.close();
    await rm(rootDirectory, { force: true, recursive: true });
  }
});

test("closes a full page while its content event stream remains connected", async ({ page }) => {
  const rootDirectory = await mkdtemp(path.join(os.tmpdir(), "ctn-shutdown-sse-"));
  const server = await startE2EWorkspaceServer({ rootDirectory });

  try {
    const connected = waitForHmrConnection(page);
    const contentEvents = page.waitForResponse((response) =>
      response.url().endsWith("/api/v4/content/events")
    );

    await page.goto(server.baseUrl);
    await Promise.all([connected, contentEvents]);
    await expect(page.getByRole("navigation", { name: "活动导航" }))
      .toBeVisible();
    const closeState = await waitForClose(server.close(), 7_000);

    expect(closeState, "the open page must not retain the repository writer lease")
      .toBe("closed");
    const competingLease = new LocalRepositoryRootLease(server.repositoryDirectory);

    try {
      await competingLease.initialize();
    } finally {
      await competingLease.dispose();
    }
  } finally {
    await page.close();
    await server.close();
    await rm(rootDirectory, { force: true, recursive: true });
  }
});

test("releases the repository writer lease without a browser connection", async () => {
  const rootDirectory = await mkdtemp(path.join(os.tmpdir(), "ctn-shutdown-idle-"));
  const server = await startE2EWorkspaceServer({ rootDirectory });
  const competingLease = new LocalRepositoryRootLease(server.repositoryDirectory);

  try {
    await server.close();
    await competingLease.initialize();
    await expect(server.close()).resolves.toBeUndefined();
  } finally {
    await competingLease.dispose();
    await server.close();
    await rm(rootDirectory, { force: true, recursive: true });
  }
});
