import type { ReactNode } from "react";
import type { CtnBlock } from "../../ctn-parser/types";

export type CtnBlockTreeRenderBlockInput = {
  block: CtnBlock;
  children: ReactNode;
  depth: number;
  hasChildren: boolean;
};

type CtnBlockTreeProps = {
  className: string;
  depth?: number;
  nodes: CtnBlock[];
  renderBlock: (input: CtnBlockTreeRenderBlockInput) => ReactNode;
};

export function CtnBlockTree({
  className,
  depth = 0,
  nodes,
  renderBlock,
}: CtnBlockTreeProps) {
  return (
    <ul className={className} data-depth={depth}>
      {nodes.map((block) => {
        const hasChildren = block.children.length > 0;
        const children = hasChildren ? (
          <CtnBlockTree
            className={className}
            depth={depth + 1}
            nodes={block.children}
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
