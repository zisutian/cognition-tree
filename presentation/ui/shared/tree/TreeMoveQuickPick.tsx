import { QuickPick } from "../QuickPick.tsx";
import { useFeedback } from "../FeedbackProvider.tsx";
import { getTreeNodeReference } from "./drag.ts";
import { createTreeMoveOptions } from "./moveOptions.ts";
import type {
  TreeMoveRequest,
  TreeNode,
} from "./types.ts";

export function TreeMoveQuickPick({
  nodes,
  sourceNode,
  onClose,
  onMove,
}: {
  nodes: TreeNode[];
  sourceNode: TreeNode | null;
  onClose: () => void;
  onMove: (request: TreeMoveRequest) => void;
}) {
  const { runAction } = useFeedback();
  const options = sourceNode
    ? createTreeMoveOptions(nodes, sourceNode)
    : [];

  return (
    <QuickPick
      ariaLabel="移动到"
      open={sourceNode !== null}
      options={options}
      placeholder="筛选目录"
      onClose={onClose}
      onSelect={(selectedOption) => {
        const option = options.find(
          (candidate) => candidate.id === selectedOption.id,
        );

        if (option && sourceNode) {
          runAction(() =>
            onMove({
              destination: option.destination,
              source: getTreeNodeReference(sourceNode),
            }),
          );
        }

        onClose();
      }}
    />
  );
}
