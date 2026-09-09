// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import { expect, type APIRequestContext } from "@playwright/test";
import {
  buildApiOperationPath,
  parseApiOperationResponse,
  type ContentQueryResultDto,
} from "../../contracts/api/index.ts";
import type { ContentOperationResultDto } from "../../contracts/content/index.ts";

/** Prepare a real empty/selected catalog in the worker's disposable service. */
export async function removeOtherWorkbenchRepositories(
  api: APIRequestContext,
  keepId?: string,
) {
  const response = await api.post(buildApiOperationPath("queryLocalContent"), {
    data: { kind: "catalog" },
  });
  expect(response.status()).toBe(200);
  const catalog = parseApiOperationResponse(
    "queryLocalContent",
    response.status(),
    await response.json(),
  ) as ContentQueryResultDto;
  if (catalog.kind !== "catalog")
    throw new Error("Expected repository catalog");
  let basis = catalog.basis;
  for (const repository of catalog.repositories) {
    if (repository.id === keepId) continue;
    const deleted = await api.post(
      buildApiOperationPath("executeContentOperation"),
      {
        data: {
          operationId: randomUUID(),
          basis,
          scope: { domain: "catalog" },
          command: { kind: "delete-repository", repository: repository.name },
        },
      },
    );
    const receipt = parseApiOperationResponse(
      "executeContentOperation",
      deleted.status(),
      await deleted.json(),
    ) as ContentOperationResultDto;
    expect(receipt.status).toBe("committed");
    expect(receipt.afterRevision).toBeTruthy();
    basis = { ...basis, baseRevision: receipt.afterRevision! };
  }
}
