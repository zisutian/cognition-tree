// SPDX-License-Identifier: GPL-3.0-or-later

import type { ButtonHTMLAttributes, ReactElement } from "react";
import { Children } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CollapsibleContextGroup } from "../../../presentation/ui/shared/CollapsibleContextGroup";
import {
  ToolDivider,
  ToolList,
  ToolListRow,
  ToolPanel,
  ToolPanelBody,
  ToolSection,
  ToolSectionStack,
  ToolToolbar,
} from "../../../presentation/ui/shared/ToolSurface";
import {
  readContextGroupSessionExpanded,
  useContextGroupSessionState,
  writeContextGroupSessionExpanded,
} from "../../../presentation/ui/shared/contextGroupSession";

describe("tool surfaces", () => {
  it("owns the three content-width layouts and section relationships", () => {
    const markup = renderToStaticMarkup(
      <>
        <ToolPanel aria-label="工具页" title="工具标题">
          <ToolPanelBody layout="form">
            <ToolSectionStack>
              <ToolSection description="说明" title="表单分区">
                表单
              </ToolSection>
              <ToolSection
                actions={<button type="button">操作</button>}
                title="后续分区"
              >
                内容
              </ToolSection>
            </ToolSectionStack>
          </ToolPanelBody>
        </ToolPanel>
        <ToolPanelBody layout="table">规则</ToolPanelBody>
        <ToolPanelBody layout="results">结果</ToolPanelBody>
      </>,
    );

    expect(markup).toContain('data-tool-layout="form"');
    expect(markup).toContain('data-tool-layout="table"');
    expect(markup).toContain('data-tool-layout="results"');
    expect(markup).toContain('class="ui-panel ui-panel-main ui-tool-panel"');
    expect(markup).toContain("<h2>工具标题</h2>");
    expect(markup).toContain('aria-labelledby=');
    expect(markup.match(/class="ui-tool-section"/g)).toHaveLength(2);
    expect(markup).toContain("表单分区");
    expect(markup).toContain("说明");
    expect(markup).toContain("操作");
  });

  it("owns toolbars, dividers, and explicit wrapping row markup", () => {
    const markup = renderToStaticMarkup(
      <>
        <ToolToolbar aria-label="筛选">
          <label>来源<select><option>全部</option></select></label>
        </ToolToolbar>
        <ToolDivider />
        <ToolList aria-label="工具结果">
          <ToolListRow
            buttonProps={{ "aria-label": "打开结果" }}
            flow="wrap"
            leading="块匹配"
            main="正文"
            meta="位置"
            onSelect={() => undefined}
          />
          <ToolListRow
            actions={<button type="button">关闭</button>}
            flow="single-line"
            main="问题"
            onSelect={() => undefined}
            style={{ height: "22px", transform: "translateY(44px)" }}
          />
          <ToolListRow flow="single-line" main="静态信息" />
        </ToolList>
      </>,
    );

    expect(markup).toContain('aria-label="筛选"');
    expect(markup).toContain("ui-tool-divider");
    expect(markup).toContain("ui-tool-list-row-wrap");
    expect(markup).toContain("ui-tool-list-row-single-line");
    expect(markup).toContain('aria-label="打开结果"');
    expect(markup).toContain("height:22px");
    expect(markup).toContain("translateY(44px)");
    expect(markup).toContain("关闭");
    expect(markup).toContain("<div class=\"ui-tool-list-row-target\"");
  });
});

describe("collapsible context groups", () => {
  it("keeps expansion controlled with native keyboard button semantics", () => {
    const onExpandedChange = vi.fn();
    const element = CollapsibleContextGroup({
      children: <li>条目</li>,
      count: 1,
      expanded: false,
      headingId: "shared-context-group",
      label: "分组",
      listAriaLabel: "分组条目",
      onExpandedChange,
    });
    const heading = Children.toArray(element.props.children)[0] as ReactElement<{
      children: ReactElement<ButtonHTMLAttributes<HTMLButtonElement>>;
    }>;
    const button = heading.props.children;

    button.props.onClick?.({} as never);

    expect(onExpandedChange).toHaveBeenCalledWith(true);
    expect(button.props.type).toBe("button");
    expect(button.props["aria-expanded"]).toBe(false);

    const collapsedMarkup = renderToStaticMarkup(element);
    const expandedMarkup = renderToStaticMarkup(
      <CollapsibleContextGroup
        expanded
        headingId="shared-context-expanded"
        label="分组"
        listAriaLabel="分组条目"
        onExpandedChange={() => undefined}
      >
        <li>条目</li>
      </CollapsibleContextGroup>,
    );

    expect(collapsedMarkup).toContain(
      'aria-controls="shared-context-group-content"',
    );
    expect(collapsedMarkup).toContain('aria-expanded="false"');
    expect(collapsedMarkup).toContain('hidden=""');
    expect(expandedMarkup).toContain('aria-expanded="true"');
    expect(expandedMarkup).not.toContain('hidden=""');
    expect(expandedMarkup).toContain('aria-label="分组条目"');
  });

  it("retains expansion by key only for the current module session", () => {
    const key = "tool-surface-test-session";

    expect(readContextGroupSessionExpanded(key, true)).toBe(true);
    writeContextGroupSessionExpanded(key, false);
    expect(readContextGroupSessionExpanded(key, true)).toBe(false);
    expect(readContextGroupSessionExpanded(`${key}-other`, true)).toBe(true);

    function SessionGroup() {
      const [expanded, setExpanded] = useContextGroupSessionState(key, true);

      return (
        <CollapsibleContextGroup
          expanded={expanded}
          headingId="session-backed-group"
          label="会话分组"
          onExpandedChange={setExpanded}
        >
          <li>条目</li>
        </CollapsibleContextGroup>
      );
    }

    expect(renderToStaticMarkup(<SessionGroup />)).toContain(
      'aria-expanded="false"',
    );
  });
});
