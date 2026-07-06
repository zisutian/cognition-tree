import type { ReactNode } from "react";

export type BlockTreeNode = {
  children: BlockTreeNode[];
  id: string;
};

export type BlockTreeRenderBlockInput<T extends BlockTreeNode> = {
  block: T;
  children: ReactNode;
  depth: number;
  hasChildren: boolean;
};

type BlockTreeProps<T extends BlockTreeNode> = {
  className: string;
  depth?: number;
  nodes: T[];
  renderBlock: (input: BlockTreeRenderBlockInput<T>) => ReactNode;
};

export function BlockTree<T extends BlockTreeNode>({
  className,
  depth = 0,
  nodes,
  renderBlock,
}: BlockTreeProps<T>) {
  return (
    <ul className={className} data-depth={depth}>
      {nodes.map((block) => {
        const hasChildren = block.children.length > 0;
        const children = hasChildren ? (
          <BlockTree
            className={className}
            depth={depth + 1}
            nodes={block.children as T[]}
            renderBlock={renderBlock}
          />
        ) : null;

        return (
          <li key={block.id}>
            {renderBlock({ block, children, depth, hasChildren })}
          </li>
        );
      })}
    </ul>
  );
}
