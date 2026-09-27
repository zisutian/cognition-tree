import type { CtnSyntaxTone } from "../../../core/ctn/index.ts";
import { createClassNames } from "./classNames.ts";
import {
  createToneStyle,
  getTextColorClassName,
  getToneClassName,
} from "./tonePresentation.ts";
import contentStyles from "./Content.module.css";
const cx = createClassNames(contentStyles);

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
      className={cx(`block-text ${getTextColorClassName(text.textColor)}`)}
      style={createToneStyle("default", text.textColor)}
    >
      {text.segments.map((segment) =>
        segment.kind === "inline" ? (
          <span
            className={cx(
              `block-text-inline ${getToneClassName(segment.tone)}`,
            )}
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
