import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { UiBlockNode } from "../../../../src/application/workspace/projection/viewBlocks";
import { MigrationSourceTree } from "../../../../src/ui/activities/migration/MigrationSourceTree";

function createBlock({
  children = [],
  lineNumber,
  label,
}: {
  children?: UiBlockNode[];
  lineNumber: number;
  label: string;
}): UiBlockNode {
  return {
    children,
    hasDiagnostics: false,
    id: `block-${lineNumber}`,
    label,
    level: lineNumber === 2 ? 0 : 1,
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

describe("MigrationSourceTree", () => {
  it("marks an entire selected source block subtree", () => {
    const child = createBlock({
      label: "Definition",
      lineNumber: 3,
    });
    const root = createBlock({
      children: [child],
      label: "Root",
      lineNumber: 2,
    });
    const markup = renderToStaticMarkup(
      <MigrationSourceTree
        draggingLineNumber={null}
        nodes={[root]}
        selectedLineNumbers={new Set([2, 3])}
        selectedRootLineNumber={2}
        onDragEnd={() => undefined}
        onDragStart={() => undefined}
        onSelectBlock={() => undefined}
      />,
    );

    expect(markup.match(/is-selected-subtree/g)).toHaveLength(2);
    expect(markup.match(/is-selected-root/g)).toHaveLength(1);
    expect(markup).toContain("Root");
    expect(markup).toContain("Definition");
  });
});
