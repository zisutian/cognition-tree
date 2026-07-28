import type {
  CtnSyntaxTone,
} from "../../../core/ctn/syntax/types";
import {
  createToneStyle,
  getTextColorClassName,
  getToneClassName,
} from "./tonePresentation";

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
        tone: CtnSyntaxTone;
      }
  >;
  textColor: CtnSyntaxTone;
};

export function BlockText({ text }: { text: DisplayText }) {
  return (
    <span
      className={`block-text ${getTextColorClassName(text.textColor)}`}
      style={createToneStyle("default", text.textColor)}
    >
      {text.segments.map((segment) =>
        segment.kind === "inline" ? (
          <span
            className={`block-text-inline ${getToneClassName(segment.tone)}`}
            key={segment.id}
            style={createToneStyle(segment.tone, "default")}
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
