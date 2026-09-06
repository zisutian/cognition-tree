// SPDX-License-Identifier: GPL-3.0-or-later

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ToolDivider,
  DetailPanel,
  ToolList,
  ToolListRow,
  ToolPanel,
  ToolPanelBody,
  ToolPropertyList,
  ToolPropertyRow,
  ToolSection,
  ToolSectionStack,
  ToolToolbar,
} from "../../../presentation/ui/index";

describe("tool surfaces", () => {
  it("labels panels and their sections for navigation", () => {
    const markup = renderToStaticMarkup(
      <>
        <ToolPanel aria-label="工具页" title="工具标题">
          <ToolPanelBody layout="form">
            <ToolSectionStack>
              <ToolSection title="表单分区">
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
        <DetailPanel
          aria-label="工具详情"
          onCollapse={() => undefined}
          title="状态"
        >
          <ToolPanelBody layout="detail">详情</ToolPanelBody>
        </DetailPanel>
        <ToolPanelBody layout="table">规则</ToolPanelBody>
        <ToolPanelBody layout="results">结果</ToolPanelBody>
      </>,
    );

    expect(markup).toContain("<h2>工具标题</h2>");
    expect(markup).toContain('aria-label="收回右侧详情"');
    expect(markup).toContain('aria-labelledby=');
    expect(markup.match(/class="ui-tool-section"/g)).toHaveLength(2);
    expect(markup).toContain("表单分区");
    expect(markup).toContain("操作");
  });

  it("distinguishes selectable results from static information", () => {
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
    expect(markup).toContain('aria-label="打开结果"');
    expect(markup).toContain("关闭");
    expect(markup.match(/<button/g)).toHaveLength(3);
    expect(markup).toContain("静态信息");
  });

  it("renders properties as a definition list", () => {
    const markup = renderToStaticMarkup(
      <ToolPropertyList aria-label="仓库属性">
        <ToolPropertyRow label="状态" value="已挂载" />
        <ToolPropertyRow
          actions={<button aria-label="复制路径" type="button">复制</button>}
          label="数据路径"
          value={<code>/srv/cognition-tree/repositories/example</code>}
        />
      </ToolPropertyList>,
    );

    expect(markup).toContain("/srv/cognition-tree/repositories/example");
    expect(markup.match(/<dt>/g)).toHaveLength(2);
    expect(markup.match(/<dd>/g)).toHaveLength(2);
    expect(markup.match(/<button/g)).toHaveLength(1);
  });
});
