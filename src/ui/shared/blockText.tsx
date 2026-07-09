import type { CSSProperties } from "react";

type ToneStyle = {
  "--ctn-text-color"?: string;
  "--ctn-tone-color"?: string;
};

export type DisplayText = {
  displayText: string;
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
        style?: ToneStyle;
      }
  >;
  style?: ToneStyle;
  textColorClassName: string;
};

function toneStyle(style: ToneStyle | undefined) {
  return style as CSSProperties | undefined;
}

export function BlockText({ text }: { text: DisplayText }) {
  return (
    <span className={`block-text ${text.textColorClassName}`} style={toneStyle(text.style)}>
      {text.segments.map((segment) =>
        segment.kind === "inline" ? (
          <span
            className={`block-text-inline ${segment.toneClassName} ${segment.textColorClassName}`}
            key={segment.id}
            style={toneStyle(segment.style)}
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
