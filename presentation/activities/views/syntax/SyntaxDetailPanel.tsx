import { ChevronRight } from "lucide-react";
import type { SyntaxViewModel } from "../../../../application/workspace/activities/syntax/syntaxViewModel";
import type { UiSyntaxTone } from "../../../../application/workspace/projection/viewSyntax";
import {
  Button,
  Panel,
  PanelBody,
  PanelHeader,
  cx,
} from "../../../ui/shared/primitives";
import {
  createToneStyle,
  getTextColorClassName,
  getToneClassName,
} from "../../../ui/shared/tonePresentation";
import {
  getInlinePreviewMarker,
  getInlinePreviewValue,
} from "./syntaxPreview";

function SyntaxRenderLine({
  inline = false,
  marker,
  textColor,
  tone,
  value,
}: {
  inline?: boolean;
  marker: string;
  textColor: UiSyntaxTone;
  tone: UiSyntaxTone;
  value: string;
}) {
  const toneClassName = getToneClassName(tone);

  return (
    <div
      className={cx(
        "syntax-render-line",
        toneClassName,
      )}
      style={createToneStyle(tone, textColor)}
    >
      <span className="syntax-render-marker">{marker}</span>
      <span
        className={cx(
          "syntax-render-text",
          getTextColorClassName(textColor),
          inline && "block-text-inline",
          inline && toneClassName,
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
  view: SyntaxViewModel;
}) {
  return (
    <Panel aria-label="语法预览" tone="detail">
      <PanelHeader
        title="语法预览"
        actions={
          <Button
            aria-label="收回右侧详情"
            onClick={onCollapseDetail}
            title="收回右侧详情"
            type="button"
            variant="icon"
          >
            <ChevronRight aria-hidden="true" size={14} />
          </Button>
        }
      />
      <PanelBody className="detail-panel-stack" scroll>
        <div aria-label="语法预览内容" className="syntax-render-list">
          <SyntaxRenderLine
            marker="T"
            textColor={view.draft.titleRule.textColor}
            tone={view.draft.titleRule.tone}
            value="首行标题示例"
          />
          {view.draft.topLevelUnmarkedRule && view.rootRuleLabel ? (
            <SyntaxRenderLine
              marker={view.selectedTarget.kind === "journal" ? "B" : "C"}
              textColor={view.draft.topLevelUnmarkedRule.textColor}
              tone={view.draft.topLevelUnmarkedRule.tone}
              value={`${view.rootRuleLabel}示例`}
            />
          ) : null}
          {view.draft.markerRules.map((rule) => (
            <SyntaxRenderLine
              key={rule.id}
              marker={rule.marker || "·"}
              textColor={rule.textColor}
              tone={rule.tone}
              value={`${rule.label}示例`}
            />
          ))}
          {view.draft.inlineRules.map((rule) => (
            <SyntaxRenderLine
              inline
              key={rule.id}
              marker={getInlinePreviewMarker(rule)}
              textColor={rule.textColor}
              tone={rule.tone}
              value={getInlinePreviewValue(rule)}
            />
          ))}
        </div>
      </PanelBody>
    </Panel>
  );
}
