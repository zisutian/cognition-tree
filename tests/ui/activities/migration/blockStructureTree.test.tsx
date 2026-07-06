import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { UiBlockNode } from "../../../../src/application/workspace/projection/viewBlocks";
import { BlockStructureTree } from "../../../../src/ui/activities/migration/BlockStructureTree";

function createBlock({
  children = [],
  lineNumber,
  label,
  level = 0,
}: {
  children?: UiBlockNode[];
  lineNumber: number;
  label: string;
  level?: number;
}): UiBlockNode {
  return {
    children,
    hasDiagnostics: false,
    id: `block-${lineNumber}`,
    label,
    level,
    lineLabel: `L${lineNumber}`,
    lineNumber,
    textDisplay: {
      displayText: label,
      segments: [
        {
          id: `block-${lineNumber}-text`,
          kind: "text",
          text: label,
        },
      ],
      textColorClassName: "ctn-text-color-default",
    },
  };
}

describe("BlockStructureTree", () => {
  it("marks the selected structure subtree and hides drop zones inside it", () => {
    const child = createBlock({
      label: "Definition",
      level: 1,
      lineNumber: 3,
    });
    const root = createBlock({
      children: [child],
      label: "Root",
      lineNumber: 2,
    });
    const markup = renderToStaticMarkup(
      <BlockStructureTree
        activeDropPositionValue={null}
        activeTargetBlockLineNumber={3}
        draggingLineNumber="2"
        nodes={[root]}
        selectedLineNumbers={new Set([2, 3])}
        selectedRootLineNumber={2}
        onDragEnd={() => undefined}
        onDragLeavePosition={() => undefined}
        onDragOverPosition={() => undefined}
        onDragOverTargetBlock={() => undefined}
        onDragStart={() => undefined}
        onDropPosition={() => undefined}
        onSelectBlock={() => undefined}
      />,
    );

    expect(markup.match(/is-selected-subtree/g)).toHaveLength(2);
    expect(markup.match(/is-selected-root/g)).toHaveLength(1);
    expect(markup).not.toContain("上方并列");
    expect(markup).not.toContain("作为子结点");
    expect(markup).not.toContain("下方并列");
  });
});
