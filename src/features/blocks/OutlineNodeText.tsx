import type { CSSProperties } from "react";
import type { OutlineNode } from "../../ctn-parser/types";
import {
  getSyntaxTextColorClassName,
  getSyntaxToneClassName,
  isCustomSyntaxTone,
} from "../../ctn-syntax/tones";
import type { CtnSyntaxTone } from "../../ctn-syntax/types";
import { createOutlineTextSegments } from "./outlineTextSegments";

type OutlineNodeTextProps = {
  className?: string;
  node: OutlineNode;
};

function getColorStyle(
  tone: CtnSyntaxTone,
  textColor: CtnSyntaxTone,
): CSSProperties | undefined {
  const style: CSSProperties & {
    "--ctn-text-color"?: string;
    "--ctn-tone-color"?: string;
  } = {};

  if (isCustomSyntaxTone(tone)) {
    style["--ctn-tone-color"] = tone;
  }

  if (isCustomSyntaxTone(textColor)) {
    style["--ctn-text-color"] = textColor;
  }

  return Object.keys(style).length > 0 ? style : undefined;
}

export function OutlineNodeText({
  className = "node-text",
  node,
}: OutlineNodeTextProps) {
  return (
    <span
      className={`${className} ${getSyntaxTextColorClassName(node.textColor)}`}
      style={getColorStyle("default", node.textColor)}
    >
      {createOutlineTextSegments(node).map((segment) =>
        segment.kind === "inline" ? (
          <span
            className={`outline-inline ${getSyntaxToneClassName(segment.tone)} ${getSyntaxTextColorClassName(segment.textColor)}`}
            key={segment.id}
            style={getColorStyle(segment.tone, segment.textColor)}
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
