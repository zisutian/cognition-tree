import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ContextMenu } from "../../../presentation/ui/shared/ContextMenu";
import {
  FeedbackProvider,
  getErrorMessage,
  runActivityFeedbackAction,
  runFeedbackAction,
} from "../../../presentation/ui/shared/FeedbackProvider";
import { createProblemCenter } from
  "../../../application/problems/problemCenter";
import { resolveOverlayCoordinates } from "../../../presentation/ui/shared/Overlay";
import { QuickPick } from "../../../presentation/ui/shared/QuickPick";

describe("shared overlays", () => {
  it("renders quick pick options with searchable dialog semantics", () => {
    const markup = renderToStaticMarkup(
      <QuickPick
        ariaLabel="移动到"
        open
        options={[
          { description: "工作区根级", id: "root", label: "根目录" },
        ]}
        onClose={() => undefined}
        onSelect={() => undefined}
      />,
    );

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('role="combobox"');
    expect(markup).toContain('aria-controls=');
    expect(markup).toContain('role="listbox"');
    expect(markup).toContain('role="option"');
    expect(markup).toContain("根目录");
  });

  it("renders context menus with only supplied commands", () => {
    const markup = renderToStaticMarkup(
      <ContextMenu
        ariaLabel="目录操作"
        items={[
          { id: "move", label: "移动到…", onSelect: () => undefined },
        ]}
        position={{ x: 10, y: 20 }}
        onClose={() => undefined}
      />,
    );

    expect(markup).toContain('role="menu"');
    expect(markup).toContain('role="menuitem"');
    expect(markup).toContain("移动到…");
    expect(markup).not.toContain("删除");
  });

  it("normalizes feedback errors without rendering an overlay", () => {
    const markup = renderToStaticMarkup(
      <FeedbackProvider>
        <span>工作台</span>
      </FeedbackProvider>,
    );

    expect(getErrorMessage(new Error("保存失败"))).toBe("保存失败");
    expect(getErrorMessage("连接失败")).toBe("连接失败");
    expect(markup).toContain("工作台");
  });

  it("reports both synchronous throws and asynchronous rejections", async () => {
    const errors: unknown[] = [];

    expect(
      runFeedbackAction(() => {
        throw new Error("同步失败");
      }, (error) => errors.push(error)),
    ).toBeUndefined();
    await expect(
      runFeedbackAction(
        () => Promise.reject(new Error("异步失败")),
        (error) => errors.push(error),
      ),
    ).resolves.toBeUndefined();

    expect(errors.map(getErrorMessage)).toEqual(["同步失败", "异步失败"]);
  });

  it("keeps an asynchronous error in the Activity that started it", async () => {
    const controller = createProblemCenter<"notes" | "todo">({
      scheduler: { schedule: () => () => undefined },
    });
    let rejectAction: (error: Error) => void = () => undefined;
    const action = runActivityFeedbackAction(
      controller,
      "notes",
      () => new Promise<void>((_resolve, reject) => {
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
  });

  it("clamps point and anchored overlays into the viewport", () => {
    expect(
      resolveOverlayCoordinates({
        panelHeight: 80,
        panelWidth: 120,
        point: { x: 395, y: 295 },
        viewportHeight: 300,
        viewportWidth: 400,
      }),
    ).toEqual({ left: 272, top: 212 });
    expect(
      resolveOverlayCoordinates({
        align: "end",
        anchorRect: {
          bottom: 290,
          left: 350,
          right: 390,
          top: 270,
          width: 40,
        },
        panelHeight: 100,
        panelWidth: 160,
        viewportHeight: 300,
        viewportWidth: 400,
      }),
    ).toEqual({ left: 230, top: 166 });
  });
});
