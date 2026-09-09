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
  return {
    body: result,
    statusCode:
      result.status === "conflict"
        ? 409
        : result.status === "failed"
          ? 400
          : result.status === "indeterminate"
            ? 503
            : result.status === "pending"
              ? 202
              : 200,
  };
}
