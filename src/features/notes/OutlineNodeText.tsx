import type { OutlineNode } from "../../ctn/parseOutline";
import { createOutlineTextSegments } from "./outlineTextSegments";

type OutlineNodeTextProps = {
  className?: string;
  node: OutlineNode;
};

export function OutlineNodeText({
  className = "node-text",
  node,
}: OutlineNodeTextProps) {
  return (
    <span className={className}>
      {createOutlineTextSegments(node).map((segment) =>
        segment.kind === "inline" ? (
          <span className="outline-inline" key={segment.id}>
            {segment.text}
          </span>
        ) : (
          <span key={segment.id}>{segment.text}</span>
        ),
      )}
    </span>
  );
}
