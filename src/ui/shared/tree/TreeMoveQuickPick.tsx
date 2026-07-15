import { QuickPick } from "../QuickPick";
import { useFeedback } from "../FeedbackProvider";
import { getTreeNodeReference } from "./drag";
import { createTreeMoveOptions } from "./moveOptions";
import type {
  TreeMoveRequest,
  TreeNode,
} from "./types";

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
