// SPDX-License-Identifier: GPL-3.0-or-later

import { renderToStaticMarkup } from "../../../support/presentation/render";
import { describe, expect, it } from "vitest";
import { Page, PageBody } from "../../../../presentation/ui/index";
import {
  Section,
  Stack as SectionStack,
  PropertyList as ToolPropertyList,
  PropertyRow as ToolPropertyRow,
} from "compact-ui";

describe("tool surfaces", () => {
  it("labels panels and their sections for navigation", () => {
    const markup = renderToStaticMarkup(
      <>
        <Page aria-label="工具页">
          <PageBody layout="form">
            <SectionStack>
              <Section title="表单分区">表单</Section>
              <Section
                actions={<button type="button">操作</button>}
                title="后续分区"
              >
                内容
              </Section>
            </SectionStack>
          </PageBody>
        </Page>
        <Page aria-label="工具详情">
          <PageBody layout="detail">详情</PageBody>
        </Page>
      </>,
    );

    expect(markup).toContain('aria-label="工具页"');
    expect(markup).not.toContain('aria-label="收回右侧详情"');
    expect(markup).toContain("<h3>表单分区</h3>");
    expect(markup).toContain("表单分区");
    expect(markup).toContain("操作");
  });

  it("renders properties as a definition list", () => {
    const markup = renderToStaticMarkup(
      <ToolPropertyList aria-label="仓库属性">
        <ToolPropertyRow label="状态" children="已挂载" />
        <ToolPropertyRow
          action={
            <button aria-label="复制路径" type="button">
              复制
            </button>
          }
          label="数据路径"
          children={<code>/srv/cognition-tree/repositories/example</code>}
        />
      </ToolPropertyList>,
    );

    expect(markup).toContain("/srv/cognition-tree/repositories/example");
    expect(markup.match(/<dt>/g)).toHaveLength(2);
    expect(markup.match(/<dd>/g)).toHaveLength(2);
    expect(markup.match(/<button/g)).toHaveLength(1);
  });
});
