// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  ButtonHTMLAttributes,
  ReactElement,
} from "react";
import { Children } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  CompactContextGroup,
  CompactContextList,
  CompactContextActionButtons,
  CompactContextRow,
  CompactContextStatusIcon,
  CompactContextStaticRow,
} from "../../../presentation/ui/shared/CompactContextList";

describe("compact context lists", () => {
  it("exposes group, selection, status, metadata, and actions semantically", () => {
    const markup = renderToStaticMarkup(
      <CompactContextGroup
        count={2}
        headingId="context-group-primary"
        label="主要"
        listAriaLabel="主要项目"
      >
        <CompactContextRow
          actions={<CompactContextActionButtons actions={[{
            ariaLabel: "删除当前项目",
            label: "删",
            onSelect: () => undefined,
            tone: "danger",
          }]} />}
          buttonProps={{ "data-item-id": "item-1" }}
          icon={(
            <CompactContextStatusIcon label="当前项目">
              <span aria-hidden="true">I</span>
            </CompactContextStatusIcon>
          )}
          label="当前项目"
          selected
          trailing={<span className="ui-tree-meta">启用</span>}
          onSelect={() => undefined}
        />
      </CompactContextGroup>,
    );

    expect(markup).toContain('aria-labelledby="context-group-primary"');
    expect(markup).toContain('aria-label="主要项目"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('data-item-id="item-1"');
    expect(markup).toContain("当前项目");
    expect(markup).toContain('aria-label="当前项目"');
    expect(markup).toContain("启用");
    expect(markup).toContain('aria-label="删除当前项目"');
  });

  it("owns inline rename markup while leaving value and validation controlled", () => {
    const row = CompactContextRow({
      actions: <button type="button">不应显示</button>,
      icon: <span aria-hidden="true">I</span>,
      inlineRename: {
        ariaLabel: "重命名集合 当前集合",
        inputProps: {
          "aria-describedby": "rename-error",
          "aria-invalid": true,
        },
        onCancel: () => undefined,
        onChange: () => undefined,
        onSubmit: () => undefined,
        value: "当前集合",
      },
      label: "当前集合",
      onSelect: () => undefined,
    });
    const markup = renderToStaticMarkup(
      <CompactContextList>{row}</CompactContextList>,
    );

    expect(markup).toContain('aria-label="重命名集合 当前集合"');
    expect(markup).toContain('value="当前集合"');
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('aria-describedby="rename-error"');
    expect(markup).toContain('aria-label="重命名集合 当前集合，确定"');
    expect(markup).toContain('aria-label="重命名集合 当前集合，取消"');
    expect(markup).not.toContain("不应显示");
  });

  it("starts inline rename from F2 and keeps static rows non-selectable", () => {
    const onBeginRename = vi.fn();
    const element = CompactContextRow({
      icon: <span aria-hidden="true">I</span>,
      label: "项目",
      onBeginRename,
      onSelect: () => undefined,
    });
    const button = Children.toArray(element.props.children)[0] as ReactElement<
      ButtonHTMLAttributes<HTMLButtonElement>
    >;
    const preventDefault = vi.fn();

    button.props.onKeyDown?.({
      defaultPrevented: false,
      key: "F2",
      preventDefault,
    } as never);

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(onBeginRename).toHaveBeenCalledOnce();

    const staticMarkup = renderToStaticMarkup(
      <CompactContextStaticRow
        contentProps={{ "data-system-id": "system-journal" }}
      >
        <span>日记</span>
      </CompactContextStaticRow>,
    );

    expect(staticMarkup).toContain('role="group"');
    expect(staticMarkup).toContain('tabindex="-1"');
    expect(staticMarkup).toContain('data-system-id="system-journal"');
    expect(staticMarkup).not.toContain("<button");
  });
});
