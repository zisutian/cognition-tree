// SPDX-License-Identifier: GPL-3.0-or-later

import type { ContentQueryDto } from "../../../../contracts/api/index.ts";
import type { ContentOperationRequestDto } from "../../../../contracts/content/index.ts";
import { ApiRequestError } from "../protocol/index.ts";
import type { ApiHandlerContext, HandlerResult } from "./handlerContext.ts";

export async function handleLocalContent(
  context: ApiHandlerContext,
): Promise<HandlerResult> {
  const service = context.contentService;
  if (!service)
    throw new ApiRequestError(
      "adapter_unavailable",
      "Local content operations are unavailable on this server.",
    );
  const operation = context.operation.operationId;
  if (operation === "queryLocalContent")
    return {
      body: await service.query(
        (await context.readJsonBody()) as ContentQueryDto,
      ),
      statusCode: 200,
    };
  if (operation === "getContentOperation") {
    const result = await service.result(context.route.operationId!);
    if (!result)
      throw new ApiRequestError(
        "not_found",
        "Operation ID was not found. This does not authorize replaying an operation with an uncertain outcome.",
      );
    return { body: result, statusCode: 200 };
  }
  const request = (await context.readJsonBody()) as ContentOperationRequestDto;
  const result = await service.execute(request);
  if (result.status === "conflict")
    throw new ApiRequestError(
      "resource_conflict",
      result.error?.message ?? "The read version is stale.",
      {
        details: {
          operationId: result.operationId,
          ...(result.error?.currentRevision
            ? { currentRevision: result.error.currentRevision }
            : {}),
        },
      },
    );
  if (result.status === "indeterminate")
    throw new ApiRequestError(
      "content_commit_indeterminate",
      result.error?.message ?? "The operation outcome is uncertain.",
      {
        details: {
          operationId: result.operationId,
          commitState: "indeterminate",
        },
      },
    );
  if (result.status === "failed")
    throw new ApiRequestError(
      "invalid_request",
      result.error?.message ?? "The content operation was rejected.",
      {
        details: {
          operationId: result.operationId,
          ...(result.error?.candidates
            ? {
                candidates: result.error.candidates,
                selector: result.error.selector,
              }
            : {}),
        },
      },
    );
  return { body: result, statusCode: result.status === "pending" ? 202 : 200 };
}
