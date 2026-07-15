import type { SyntaxViewModel } from "../../../application/workspace/activities/syntax/syntaxViewModel";
import { Plus } from "lucide-react";
import { useEffect } from "react";
import { syntaxFieldIds } from "../../../application/workspace/projection/viewSyntaxFields";
import {
  Button,
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

  useEffect(() => {
    const fieldId = syntax.focusTarget?.fieldId;

    if (!fieldId) {
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

    target?.scrollIntoView({ block: "nearest" });
    target?.focus({ preventScroll: true });
  }, [syntax.focusTarget?.requestId]);

  return (
    <Panel
      className="syntax-panel"
      aria-label="语法配置"
      data-syntax-field-id={syntaxFieldIds.root}
      tabIndex={-1}
    >
      <PanelHeader
        title="语法配置"
        actions={
          syntax.isConfigured ? null : (
            <Button
              onClick={() => {
                void syntax.createConfiguration().catch(feedback.notifyError);
              }}
              type="button"
              variant="secondary"
            >
              <Plus aria-hidden="true" size={13} />
              创建配置
            </Button>
          )
        }
      />
      <PanelBody scroll>
        <div className="syntax-settings-stack" aria-label="语法设置">
          <SyntaxSettingsGroup title="基础">
            <label className="syntax-setting-line">
              <span className="syntax-setting-label">名称</span>
              <input
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
