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
        textColor: string;
        tone: string;
      }
  >;
  textColor: string;
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
            className={`block-text-inline ${getToneClassName(segment.tone)} ${getTextColorClassName(segment.textColor)}`}
            key={segment.id}
            style={createToneStyle(segment.tone, segment.textColor)}
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
