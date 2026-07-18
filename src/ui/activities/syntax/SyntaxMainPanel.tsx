import type { SyntaxViewModel } from "../../../application/workspace/activities/syntax/syntaxViewModel";
import { Plus } from "lucide-react";
import { useEffect, useRef } from "react";
import { syntaxFieldIds } from "../../../application/workspace/projection/viewSyntaxFields";
import {
  Button,
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
} from "../../shared/primitives";
import { useFeedback } from "../../shared/FeedbackProvider";
import {
  InlineRuleRows,
  MarkerRuleRows,
  SyntaxRuleHeader,
  SyntaxSettingsGroup,
  TitleAndConceptRows,
} from "./SyntaxRuleRows";

export function SyntaxMainPanel({ view }: { view: SyntaxViewModel }) {
  const syntax = view;
  const feedback = useFeedback();
  const consumedFocusRequestIdRef = useRef<number | null>(null);
  const activeFile = syntax.files.find(({ isActive }) => isActive) ?? null;

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

  if (!syntax.isConfigured || !activeFile) {
    return (
      <Panel className="syntax-panel" aria-label="语法配置">
        <EmptyState
          action={
            <Button
              onClick={() => {
                void syntax.createFile().catch(feedback.notifyError);
              }}
              type="button"
              variant="primary"
            >
              <Plus aria-hidden="true" size={13} />
              新建语法
            </Button>
          }
          description="从左侧列表创建语法文件。"
          title="没有语法文件"
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
        title={activeFile.name}
      />
      <PanelBody scroll>
        <div className="syntax-settings-stack" aria-label="语法设置">
          <SyntaxSettingsGroup title="基础">
            <label className="syntax-setting-line">
              <span className="syntax-setting-label">名称</span>
              <input
                aria-describedby={syntax.nameConflictMessage
                  ? "syntax-name-conflict"
                  : undefined}
                aria-invalid={syntax.nameConflictMessage ? true : undefined}
                aria-label="语法名称"
                className="ui-input syntax-name-control"
                data-syntax-field-id={syntaxFieldIds.profileName}
                maxLength={syntax.constraints.profileName.maxLength}
                value={syntax.draft.name}
                onChange={(event) =>
                  syntax.actions.updateName(event.target.value)
                }
              />
            </label>
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
            <TitleAndConceptRows syntax={syntax} />
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
