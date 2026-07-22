import type { SyntaxViewModel } from "../../../../application/workspace/activities/syntax/syntaxViewModel";
import { RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";
import { syntaxFieldIds } from "../../../../application/workspace/projection/viewSyntaxFields";
import {
  Button,
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
} from "../../../ui/shared/primitives";
import {
  InlineRuleRows,
  MarkerRuleRows,
  SyntaxRuleHeader,
  SyntaxSettingsGroup,
  TitleAndRootRows,
} from "./SyntaxRuleRows";

export function SyntaxMainPanel({ view }: { view: SyntaxViewModel }) {
  const syntax = view;
  const consumedFocusRequestIdRef = useRef<number | null>(null);

  useEffect(() => {
    const fieldId = syntax.focusTarget?.fieldId;

    if (
      !fieldId ||
      consumedFocusRequestIdRef.current === syntax.focusTarget?.requestId
    ) {
      return;
    }

    const fields = document.querySelectorAll<HTMLElement>(
      "[data-syntax-field-id]",
    );
    const field = [...fields].find(
      (candidate) => candidate.dataset.syntaxFieldId === fieldId,
    );
    const fallback = [...fields].find(
      (candidate) => candidate.dataset.syntaxFieldId === syntaxFieldIds.root,
    );
    const target = field ?? fallback;

    if (!target || !syntax.focusTarget) {
      return;
    }

    target.scrollIntoView({ block: "nearest" });
    target.focus({ preventScroll: true });
    consumedFocusRequestIdRef.current = syntax.focusTarget.requestId;
    syntax.onConsumeFocusTarget(syntax.focusTarget.requestId);
  }, [syntax.focusTarget?.requestId, syntax.onConsumeFocusTarget]);

  if (!syntax.isSelectedAvailable) {
    return (
      <Panel className="syntax-panel" aria-label="语法配置">
        <EmptyState
          description="请等待对应仓库就绪，或在左侧选择其他语法配置。"
          title="语法配置暂不可用"
        />
      </Panel>
    );
  }

  return (
    <Panel
      className="syntax-panel"
      aria-label="语法配置"
      data-syntax-field-id={syntaxFieldIds.root}
      tabIndex={-1}
    >
      <PanelHeader
        title={syntax.draft.name || "未命名语法"}
      />
      <PanelBody scroll>
        {syntax.hasDraftErrors ? (
          <div className="syntax-invalid-draft" role="alert">
            <span>当前更改无效；修复或撤销前不能离开此配置。</span>
            <Button
              onClick={syntax.revertInvalidChanges}
              type="button"
              variant="secondary"
            >
              <RotateCcw aria-hidden="true" size={13} />
              撤销无效更改
            </Button>
          </div>
        ) : null}
        <div className="syntax-settings-stack" aria-label="语法设置">
          <SyntaxSettingsGroup title="基础">
            <div className="syntax-setting-line">
              <span className="syntax-setting-label">名称</span>
              <output
                aria-describedby={syntax.nameConflictMessage
                  ? "syntax-name-conflict"
                  : undefined}
                aria-invalid={syntax.nameConflictMessage ? true : undefined}
                aria-label="语法名称"
                className="ui-input syntax-name-control"
                data-syntax-field-id={syntaxFieldIds.profileName}
                tabIndex={-1}
              >
                {syntax.draft.name}
              </output>
            </div>
            {syntax.nameConflictMessage ? (
              <p
                className="ui-error syntax-name-error"
                id="syntax-name-conflict"
              >
                {syntax.nameConflictMessage}
              </p>
            ) : null}
            <label className="syntax-setting-line">
              <span className="syntax-setting-label">缩进宽度</span>
              <input
                aria-label="缩进宽度"
                className="ui-input syntax-number-control"
                data-syntax-field-id={syntaxFieldIds.tabDisplayWidth}
                inputMode="numeric"
                max={syntax.constraints.tabDisplayWidth.max}
                min={syntax.constraints.tabDisplayWidth.min}
                step={1}
                type="number"
                value={syntax.draft.tabDisplayWidth}
                onChange={(event) =>
                  syntax.actions.updateTabDisplayWidth(event.target.value)
                }
              />
            </label>
          </SyntaxSettingsGroup>
          <SyntaxSettingsGroup
            fieldId={syntaxFieldIds.markerRuleGroup}
            title="块规则"
          >
            <SyntaxRuleHeader />
            <TitleAndRootRows syntax={syntax} />
            <MarkerRuleRows syntax={syntax} />
          </SyntaxSettingsGroup>
          <SyntaxSettingsGroup
            fieldId={syntaxFieldIds.inlineRuleGroup}
            title="行内规则"
          >
            <SyntaxRuleHeader />
            <InlineRuleRows syntax={syntax} />
          </SyntaxSettingsGroup>
        </div>
      </PanelBody>
    </Panel>
  );
}
