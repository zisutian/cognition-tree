import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { UiOutlineNode } from "../../../../src/application/workspace/projection/viewBlocks";
import { NoteOutlinePanel } from "../../../../src/ui/activities/notes/NoteOutlinePanel";

const outlineNodes: UiOutlineNode[] = [
  {
    children: [
      {
        children: [],
        hasDiagnostics: false,
        id: "node-child",
        label: "分支",
        level: 2,
        lineLabel: "L2",
        lineNumber: 2,
        textDisplay: {
          displayText: "子节点",
          segments: [{ id: "node-child-text", kind: "text", text: "子节点" }],
          textColorClassName: "ctn-text-color-default",
        },
      },
    ],
    hasDiagnostics: false,
    id: "node-root",
    label: "主题",
    level: 1,
    lineLabel: "L1",
    lineNumber: 1,
    textDisplay: {
      displayText: "根节点",
      segments: [{ id: "node-root-text", kind: "text", text: "根节点" }],
      textColorClassName: "ctn-text-color-default",
    },
  },
];

describe("NoteOutlinePanel", () => {
  it("renders the structure tree with grouped outline zoom variables", () => {
    const markup = renderToStaticMarkup(
      <NoteOutlinePanel
        nodes={outlineNodes}
        stats={{
          diagnosticCount: 1,
          lineCount: 12,
          rootCount: 3,
          totalBlocks: 8,
        }}
        onSelectLine={() => undefined}
      />,
    );

    expect(markup).toContain("笔记结构");
    expect(markup).toContain("aria-label=\"笔记结构树缩放\"");
    expect(markup).toContain("outline-structure-area");
    expect(markup).toContain("aria-label=\"笔记统计\"");
    expect(markup).toContain("<dd>12</dd><dt>行</dt>");
    expect(markup).toContain("<dd>8</dd><dt>个块</dt>");
    expect(markup).toContain("<dd>3</dd><dt>个根节点</dt>");
    expect(markup).toContain("<dd>1</dd><dt>个诊断</dt>");
    expect(markup).not.toContain("当前笔记");
    expect(markup).toContain("根节点");
    expect(markup).toContain("子节点");
    expect(markup).toContain("--outline-font-size:12.0px");
    expect(markup).toContain("--outline-list-indent:13.0px");
    expect(markup).toContain("--outline-row-min-height:26.0px");
    expect(markup).toContain("--outline-toggle-column-width:18.0px");
    expect(markup).toContain("--outline-toggle-icon-size:13.0px");
    expect(markup).toContain("--outline-main-compact-min-height:24.0px");
    expect(markup).toContain("--outline-main-padding-block:3.0px");
  });
});
