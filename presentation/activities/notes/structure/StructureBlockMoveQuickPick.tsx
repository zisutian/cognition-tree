import {
  flattenUiBlockSubtree,
  type UiBlockNode,
} from "../../../../application/workspace/index.ts";
import {
  QuickPick,
  useFeedback,
} from "../../../ui/index.ts";


type StructureBlockMoveOption = {
  description: string;
  id: string;
  label: string;
  position: string;
};

export function createStructureBlockMoveOptions({
  blockedLineNumbers,
  nodes,
}: {
  blockedLineNumbers: ReadonlySet<number>;
  nodes: UiBlockNode[];
}): StructureBlockMoveOption[] {
  const blockOptions = nodes
    .flatMap(flattenUiBlockSubtree)
    .filter((node) => !blockedLineNumbers.has(node.lineNumber))
    .flatMap<StructureBlockMoveOption>((node) => {
      const targetLabel = `${node.label} · ${node.textDisplay.displayText}`;

      return [
        {
          description: targetLabel,
          id: `sibling-above:${node.lineNumber}`,
          label: "置于之前",
          position: `sibling-above:${node.lineNumber}`,
        },
        {
          description: targetLabel,
          id: `inside:${node.lineNumber}`,
          label: "作为子节点",
          position: `inside:${node.lineNumber}`,
        },
        {
          description: targetLabel,
          id: `sibling-below:${node.lineNumber}`,
          label: "置于之后",
          position: `sibling-below:${node.lineNumber}`,
        },
      ];
    });

  return [
    ...blockOptions,
    {
      description: "追加为最后一个根块",
      id: "end",
      label: "文末根块",
      position: "end",
    },
  ];
}

export function StructureBlockMoveQuickPick({
  blockedLineNumbers,
  nodes,
  sourceLineNumber,
  onClose,
  onMove,
}: {
  blockedLineNumbers: ReadonlySet<number>;
  nodes: UiBlockNode[];
  sourceLineNumber: number | null;
  onClose: () => void;
  onMove: (lineNumber: string, position: string) => void;
}) {
  const { runAction } = useFeedback();
  const options = createStructureBlockMoveOptions({
    blockedLineNumbers,
    nodes,
  });

  return (
    <QuickPick
      ariaLabel="移动结构块"
      open={sourceLineNumber !== null}
      options={options}
      placeholder="筛选目标结构"
      onClose={onClose}
      onSelect={(selectedOption) => {
        const option = options.find(
          (candidate) => candidate.id === selectedOption.id,
        );

        runAction(() => {
          if (!option || sourceLineNumber === null) {
            throw new Error("无法移动结构块：所选目标已失效。");
          }

          onMove(String(sourceLineNumber), option.position);
        });

        onClose();
      }}
    />
  );
}
