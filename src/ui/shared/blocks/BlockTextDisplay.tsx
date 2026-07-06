import type { CSSProperties } from "react";

type BlockTextDisplayStyle = CSSProperties | Record<string, string | undefined>;

type BlockTextDisplayText = {
  segments: Array<
    | {
        id: string;
        kind: "text";
        text: string;
      }
    | {
        id: string;
        kind: "inline";
        text: string;
        textColorClassName: string;
        toneClassName: string;
        style?: BlockTextDisplayStyle;
      }
  >;
  style?: BlockTextDisplayStyle;
  textColorClassName: string;
};

type BlockTextDisplayProps = {
  className?: string;
  text: BlockTextDisplayText;
};

export function BlockTextDisplay({
  className = "node-text",
  text,
}: BlockTextDisplayProps) {
  return (
    <span
      className={`${className} ${text.textColorClassName}`}
      style={text.style as CSSProperties | undefined}
    >
      {text.segments.map((segment) =>
        segment.kind === "inline" ? (
          <span
            className={`block-text-inline ${segment.toneClassName} ${segment.textColorClassName}`}
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
