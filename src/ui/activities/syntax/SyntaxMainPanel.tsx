import type { ViewModel } from "../../../application/workspace/view-model/useViewModel";
import {
  Panel,
  PanelBody,
  PanelHeader,
  StatusLine,
} from "../../shared/primitives";
import {
  InlineRuleRows,
  MarkerRuleRows,
  SyntaxRuleHeader,
  SyntaxSettingsGroup,
  TitleAndConceptRows,
} from "./SyntaxRuleRows";
import {
  maxTabDisplayWidth,
  readTabDisplayWidthInput,
} from "./syntaxPreview";

export function SyntaxMainPanel({ view }: { view: ViewModel }) {
  const { syntax } = view;

  return (
    <Panel className="syntax-panel" aria-label="语法配置">
      <PanelHeader title="语法配置" />
      <PanelBody scroll>
        {syntax.feedback ? (
          <StatusLine tone={syntax.feedback.status}>{syntax.feedback.message}</StatusLine>
        ) : null}
        <div className="syntax-settings-stack" aria-label="语法设置">
          <SyntaxSettingsGroup title="基础">
            <label className="syntax-setting-line">
              <span className="syntax-setting-label">名称</span>
              <input
                aria-label="语法名称"
                className="syntax-name-control"
                maxLength={64}
                value={syntax.draft.name}
                onChange={(event) =>
                  syntax.actions.updateDraftField("name", event.target.value)
                }
              />
            </label>
            <label className="syntax-setting-line">
              <span className="syntax-setting-label">缩进宽度</span>
              <input
                aria-label="缩进宽度"
                className="syntax-number-control"
                inputMode="numeric"
                max={maxTabDisplayWidth}
                min={1}
                step={1}
                type="number"
                value={syntax.draft.tabDisplayWidth}
                onChange={(event) =>
                  syntax.actions.updateDraftField(
                    "tabDisplayWidth",
                    readTabDisplayWidthInput(event.target.value),
                  )
                }
              />
            </label>
          </SyntaxSettingsGroup>
          <SyntaxSettingsGroup title="块规则">
            <SyntaxRuleHeader />
            <TitleAndConceptRows syntax={syntax} />
            <MarkerRuleRows syntax={syntax} />
          </SyntaxSettingsGroup>
          <SyntaxSettingsGroup title="行内规则">
            <SyntaxRuleHeader />
            <InlineRuleRows syntax={syntax} />
          </SyntaxSettingsGroup>
        </div>
      </PanelBody>
    </Panel>
  );
}
