import { QuickPick, type TreeMoveRequest, type TreeMoveSession } from "compact-ui";
import { flattenUiBlockSubtree, type UiBlockNode } from "../../../../application/workspace/index.ts";

type MoveTarget = TreeMoveRequest["target"];
type StructureBlockMoveOption = { description: string; id: string; label: string; target: MoveTarget };

export function createStructureBlockMoveOptions({ nodes, targetTreeId, targetContentKey, canDrop, session }: {
  nodes: readonly UiBlockNode[];
  targetTreeId: string;
  targetContentKey: string;
  session: TreeMoveSession | null;
  canDrop: (request: TreeMoveRequest) => boolean;
}): StructureBlockMoveOption[] {
  const options = nodes.flatMap(flattenUiBlockSubtree).flatMap<StructureBlockMoveOption>((node) => {
    const description = `${node.label} · ${node.textDisplay.displayText}`;
    return ([["before", "置于之前"], ["inside", "作为子节点"], ["after", "置于之后"]] as const).map(([position, label]) => ({
      description, id: `${position}:${node.id}`, label,
      target: { treeId: targetTreeId, contentKey: targetContentKey, nodeId: node.id, position },
    }));
  });
  options.push({ description: "追加为最后一个根块", id: "root-end", label: "文末根块",
    target: { treeId: targetTreeId, contentKey: targetContentKey, position: "root-end" } });
  return session ? options.filter((option) => canDrop({ ...session, target: option.target })) : [];
}

export function StructureBlockMoveQuickPick(props: Parameters<typeof createStructureBlockMoveOptions>[0] & {
  onClose: () => void;
  onMove: (request: TreeMoveRequest) => void;
}) {
  const options = createStructureBlockMoveOptions(props);
  return <QuickPick aria-label="移动结构块" open={props.session !== null}
    options={options} onClose={props.onClose} onSelect={(id) => {
      const option = options.find((candidate) => candidate.id === id);
      if (option && props.session) props.onMove({ ...props.session, target: option.target });
    }} />;
}
