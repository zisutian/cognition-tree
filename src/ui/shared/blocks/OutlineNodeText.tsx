import type { CSSProperties } from "react";
import type { UiTextDisplay } from "../../../application/workspace/viewTypes";

type OutlineNodeTextProps = {
  className?: string;
  text: UiTextDisplay;
};

export function OutlineNodeText({
  className = "node-text",
  text,
}: OutlineNodeTextProps) {
  return (
    <span
      className={`${className} ${text.textColorClassName}`}
      style={text.style as CSSProperties | undefined}
    >
      {text.segments.map((segment) =>
        segment.kind === "inline" ? (
          <span
            className={`outline-inline ${segment.toneClassName} ${segment.textColorClassName}`}
            key={segment.id}
            style={segment.style as CSSProperties | undefined}
          >
            {segment.text}
          </span>
        ) : (
          <span key={segment.id}>{segment.text}</span>
        ),
      )}
    </span>
  );
}
