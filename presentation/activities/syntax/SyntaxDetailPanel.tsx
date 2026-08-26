import type {
  AvailableSyntaxViewModel,
} from "../../../application/syntax/syntaxViewModel";
import type { UiSyntaxTone } from "../../../application/workspace/projection/viewSyntax";
import {
  PanelBody,
  cx,
} from "../../ui/shared/primitives";
import { ToolDetailPanel } from "../../ui/shared/ToolSurface";
import {
  createToneStyle,
  getTextColorClassName,
  getToneClassName,
} from "../../ui/shared/tonePresentation";
import {
  getInlinePreviewMarker,
  getInlinePreviewValue,
} from "./syntaxPreview";

function SyntaxRenderLine({
  inline = false,
  marker,
  textColor = "default",
  tone,
  value,
}: {
  inline?: boolean;
  marker: string;
  textColor?: UiSyntaxTone;
  tone: UiSyntaxTone;
  value: string;
}) {
  const toneClassName = getToneClassName(tone);

  return (
    <div
      className={cx(
        "syntax-render-line",
        toneClassName,
        inline && "is-inline",
      )}
      style={createToneStyle(tone, inline ? "default" : textColor)}
    >
      <span className="syntax-render-marker">{marker}</span>
      <span
        className={cx(
          "syntax-render-text",
          !inline && getTextColorClassName(textColor),
          inline && "block-text-inline",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function SyntaxDetailPanel({
  onCollapseDetail,
  view,
}: {
  onCollapseDetail: () => void;
  view: AvailableSyntaxViewModel;
}) {
  return (
    <ToolDetailPanel
      aria-label="语法预览"
      onCollapse={onCollapseDetail}
      title="语法预览"
    >
      <PanelBody className="detail-panel-stack" scroll>
        <div aria-label="语法预览内容" className="syntax-render-list">
          {view.selectedTarget.kind === "workspace-file" &&
              view.draft.title ? (
            <SyntaxRenderLine
              marker="T"
              textColor={view.draft.title.textColor}
              tone={view.draft.title.tone}
              value="首行标题示例"
            />
          ) : null}
          {view.draft.root && view.rootRuleLabel ? (
            <SyntaxRenderLine
              marker={view.selectedTarget.kind === "journal" ? "B" : "C"}
              textColor={view.draft.root.textColor}
              tone={view.draft.root.tone}
              value={`${view.rootRuleLabel}示例`}
            />
          ) : null}
          {view.draft.blocks.map((rule) => (
            <SyntaxRenderLine
              key={rule.id}
              marker={rule.marker || "·"}
              textColor={rule.textColor}
              tone={rule.tone}
              value={`${rule.label}示例`}
            />
          ))}
          {view.draft.inline.map((rule) => (
            <SyntaxRenderLine
              inline
              key={rule.id}
              marker={getInlinePreviewMarker(rule)}
              tone={rule.tone}
              value={getInlinePreviewValue(rule)}
            />
          ))}
        </div>
      </PanelBody>
    </ToolDetailPanel>
  );
}
