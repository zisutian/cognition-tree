import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConfirmDialog } from "../../../src/ui/shared/ConfirmDialog";
import { ContextMenu } from "../../../src/ui/shared/ContextMenu";
import {
  FeedbackProvider,
  getErrorMessage,
} from "../../../src/ui/shared/FeedbackProvider";
import { QuickPick } from "../../../src/ui/shared/QuickPick";

describe("shared overlays", () => {
  it("renders destructive confirmation as an alert dialog", () => {
    const markup = renderToStaticMarkup(
      <ConfirmDialog
        description="此操作无法撤销。"
        open
        title="删除笔记"
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />,
    );

    expect(markup).toContain('role="alertdialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain("删除笔记");
    expect(markup).toContain("此操作无法撤销。");
  });

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

  it("normalizes notification errors without changing child rendering", () => {
    const markup = renderToStaticMarkup(
      <FeedbackProvider>
        <span>工作台</span>
      </FeedbackProvider>,
    );

    expect(getErrorMessage(new Error("保存失败"))).toBe("保存失败");
    expect(getErrorMessage("连接失败")).toBe("连接失败");
    expect(markup).toContain("工作台");
    expect(markup).not.toContain("ui-notification-region");
  });
});
