import { QuickPick, type ContentTreeMoveRequest } from "compact-ui";
import {
  flattenUiBlockSubtree,
  type UiBlockNode,
} from "../../../../application/workspace/index.ts";
import { useFeedback } from "../../../ui/index.ts";

type MoveTarget = ContentTreeMoveRequest["target"];

type StructureBlockMoveOption = {
  description: string;
  id: string;
  label: string;
  target: MoveTarget;
};

export function createStructureBlockMoveOptions({
  blockedIds,
  nodes,
  targetTreeId,
}: {
  blockedIds: ReadonlySet<string>;
  nodes: readonly UiBlockNode[];
  targetTreeId: string;
}): StructureBlockMoveOption[] {
  const options = nodes
    .flatMap(flattenUiBlockSubtree)
    .filter((node) => !blockedIds.has(node.id))
    .flatMap<StructureBlockMoveOption>((node) => {
      const description = `${node.label} · ${node.textDisplay.displayText}`;
      return ([
        ["before", "置于之前"],
        ["inside", "作为子节点"],
        ["after", "置于之后"],
      ] as const).map(([position, label]) => ({
        description,
        id: `${position}:${node.id}`,
        label,
        target: { treeId: targetTreeId, nodeId: node.id, position },
      }));
    });
  return [
    ...options,
    {
      description: "追加为最后一个根块",
      id: "root-end",
      label: "文末根块",
      target: { treeId: targetTreeId, position: "root-end" },
    },
  ];
}

export function StructureBlockMoveQuickPick({
  blockedIds,
  nodes,
  sourceId,
  targetTreeId,
  onClose,
  onMove,
}: {
  blockedIds: ReadonlySet<string>;
  nodes: readonly UiBlockNode[];
  sourceId: string | null;
  targetTreeId: string;
  onClose: () => void;
  onMove: (target: MoveTarget) => void;
}) {
  const { runAction } = useFeedback();
  const options = createStructureBlockMoveOptions({
    blockedIds,
    nodes,
    targetTreeId,
  });
  return (
    <QuickPick
      aria-label="移动结构块"
      open={sourceId !== null}
      options={options}
      onClose={onClose}
      onSelect={(id) => {
        const option = options.find((candidate) => candidate.id === id);
        runAction(() => {
          if (!option || !sourceId) {
            throw new Error("无法移动结构块：所选目标已失效。");
          }
          onMove(option.target);
        });
        onClose();
      }}
    />
  );
}
