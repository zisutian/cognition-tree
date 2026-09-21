import { renderToStaticMarkup } from "../../../support/presentation/render";
import { describe, expect, it } from "vitest";

import {
  FeedbackProvider,
  runActivityFeedbackAction,
  runFeedbackAction,
} from "../../../../presentation/ui/shared/FeedbackProvider";
import { createProblemCenter } from "../../../../application/problems/problemCenter";

import { HttpApiResponseError } from "../../../../infrastructure/client/http/apiTransport";

describe("activity feedback", () => {
  it("provides feedback without rendering an overlay", () => {
    const controller = createProblemCenter<"notes">({
      scheduler: { schedule: () => () => undefined },
    });
    const markup = renderToStaticMarkup(
      <FeedbackProvider controller={controller}>
        <span>工作台</span>
      </FeedbackProvider>,
    );

    expect(markup).toContain("工作台");
    controller.dispose();
  });

  it("reports both synchronous throws and asynchronous rejections", async () => {
    const errors: unknown[] = [];
    const synchronousError = new Error("同步失败");
    const asynchronousError = new Error("异步失败");

    expect(
      runFeedbackAction(
        () => {
          throw synchronousError;
        },
        (error) => errors.push(error),
      ),
    ).toBeUndefined();
    await expect(
      runFeedbackAction(
        () => Promise.reject(asynchronousError),
        (error) => errors.push(error),
      ),
    ).resolves.toBeUndefined();

    expect(errors).toEqual([synchronousError, asynchronousError]);
  });

  it("preserves structured API errors reported by Activity actions", async () => {
    const controller = createProblemCenter<"notes">({
      scheduler: { schedule: () => () => undefined },
    });
    const error = new HttpApiResponseError("内容已被其他客户端修改。", {
      apiCode: "resource_conflict",
      details: { currentRevision: "sha256:remote" },
      path: "content",
      requestId: "request-structured-1",
      retryable: true,
      statusCode: 409,
    });

    await runActivityFeedbackAction(controller, "notes", () =>
      Promise.reject(error),
    );

    expect(controller.getSnapshot().problems).toEqual([
      expect.objectContaining({
        code: "resource_conflict",
        details: { currentRevision: "sha256:remote" },
        message: "内容已被其他客户端修改。",
        path: "content",
        requestId: "request-structured-1",
        retryable: true,
        source: "api",
        target: expect.objectContaining({ scope: "notes" }),
      }),
    ]);
    controller.dispose();
  });

  it("keeps an asynchronous error in the Activity that started it", async () => {
    const controller = createProblemCenter<"notes" | "todo">({
      scheduler: { schedule: () => () => undefined },
    });
    let rejectAction: (error: Error) => void = () => undefined;
    const action = runActivityFeedbackAction(
      controller,
      "notes",
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectAction = reject;
        }),
    );

    controller.reportInfo("todo", "已切换到代办");
    rejectAction(new Error("延迟保存失败"));
    await action;

    expect(controller.getSnapshot().problems).toEqual([
      expect.objectContaining({
        message: "延迟保存失败",
        target: expect.objectContaining({ scope: "notes" }),
      }),
    ]);
    controller.dispose();
  });
});
