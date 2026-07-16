import { Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import type { SyntaxViewModel } from "../../../application/workspace/activities/syntax/syntaxViewModel";
import type {
  UiSyntaxProfileDraftInlineRule,
  UiSyntaxTone,
} from "../../../application/workspace/projection/viewSyntax";
import {
  createSyntaxRuleFieldId,
  syntaxFieldIds,
} from "../../../application/workspace/projection/viewSyntaxFields";
import { Button } from "../../shared/primitives";
import { TonePicker } from "./TonePicker";
import { SyntaxRolePicker } from "./SyntaxRolePicker";

function SyntaxToneCells({
  customToneLabel,
  label,
  options,
  textColor,
  tone,
  onChange,
}: {
  customToneLabel: string;
  label: string;
  options: SyntaxViewModel["toneOptions"];
  textColor: UiSyntaxTone;
  tone: UiSyntaxTone;
  onChange: (patch: { textColor?: UiSyntaxTone; tone?: UiSyntaxTone }) => void;
}) {
  return (
    <>
      <TonePicker
        ariaLabel={`${label}背景色`}
        customToneLabel={customToneLabel}
        options={options}
        showLabel={false}
        value={tone}
        onChange={(nextTone) => onChange({ tone: nextTone })}
      />
      <TonePicker
        ariaLabel={`${label}文字色`}
        customToneLabel={customToneLabel}
        options={options}
        showLabel={false}
        value={textColor}
        onChange={(nextColor) => onChange({ textColor: nextColor })}
      />
    </>
  );
}

export function SyntaxSettingsGroup({
  children,
  fieldId,
  title,
}: {
  children: ReactNode;
  fieldId?: string;
  title: string;
}) {
  return (
    <div
      className="syntax-settings-group"
      aria-label={title}
      data-syntax-field-id={fieldId}
      tabIndex={fieldId ? -1 : undefined}
    >
      <div className="syntax-group-label">
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

export function SyntaxRuleHeader() {
  return (
    <div className="syntax-rule-row syntax-rule-header">
      <span>名称</span>
      <span>标记</span>
      <span>类型</span>
      <span>背景</span>
      <span>文字</span>
      <span />
    </div>
  );
}

function SyntaxRuleSpacer() {
  return <span aria-hidden="true" className="syntax-rule-spacer" />;
}

export function TitleAndConceptRows({
  syntax,
}: {
  syntax: SyntaxViewModel;
}) {
  return (
    <>
      <div
        className="syntax-rule-row"
        data-syntax-field-id={syntaxFieldIds.titleRule}
        tabIndex={-1}
      >
        <span className="syntax-readonly">首行标题</span>
        <span className="syntax-readonly">首行</span>
        <span className="syntax-readonly">标题</span>
        <SyntaxToneCells
          customToneLabel={syntax.customToneLabel}
          label="首行标题"
          options={syntax.toneOptions}
          textColor={syntax.draft.titleRule.textColor}
          tone={syntax.draft.titleRule.tone}
          onChange={syntax.actions.updateTitleRule}
        />
        <SyntaxRuleSpacer />
      </div>
      <div
        className="syntax-rule-row"
        data-syntax-field-id={syntaxFieldIds.conceptRule}
        tabIndex={-1}
      >
        <span className="syntax-readonly">顶格概念</span>
        <span className="syntax-readonly">顶格</span>
        <span className="syntax-readonly">概念</span>
        <SyntaxToneCells
          customToneLabel={syntax.customToneLabel}
          label="顶格概念"
          options={syntax.toneOptions}
          textColor={syntax.draft.conceptRule.textColor}
          tone={syntax.draft.conceptRule.tone}
          onChange={syntax.actions.updateConceptRule}
        />
        <SyntaxRuleSpacer />
      </div>
    </>
  );
}

export function MarkerRuleRows({
  syntax,
}: {
  syntax: SyntaxViewModel;
}) {
  return (
    <>
      {syntax.draft.markerRules.map((rule) => (
        <div
          className="syntax-rule-row"
          data-syntax-field-id={createSyntaxRuleFieldId("marker", rule.id)}
          key={rule.id}
          tabIndex={-1}
        >
          <input
            aria-label="名称"
            className="ui-input"
            data-syntax-field-id={createSyntaxRuleFieldId(
              "marker",
              rule.id,
              "label",
            )}
            maxLength={syntax.constraints.label.maxLength}
            value={rule.label}
            onChange={(event) =>
              syntax.actions.updateMarkerRule(rule.id, {
                label: event.target.value,
              })
            }
          />
          <input
            aria-label="标记"
            className="ui-input"
            data-syntax-field-id={createSyntaxRuleFieldId(
              "marker",
              rule.id,
              "marker",
            )}
            maxLength={syntax.constraints.token.maxLength}
            value={rule.marker}
            onChange={(event) =>
              syntax.actions.updateMarkerRule(rule.id, {
                marker: event.target.value,
              })
            }
          />
          <SyntaxRolePicker
            ariaLabel="角色"
            fieldId={createSyntaxRuleFieldId("marker", rule.id, "role")}
            options={syntax.roleOptions}
            value={rule.role}
            onChange={(role) =>
              syntax.actions.updateMarkerRule(rule.id, {
                role,
              })
            }
          />
          <TonePicker
            ariaLabel={`${rule.label}背景色`}
            customToneLabel={syntax.customToneLabel}
            fieldId={createSyntaxRuleFieldId("marker", rule.id, "tone")}
            options={syntax.toneOptions}
            showLabel={false}
            value={rule.tone}
            onChange={(tone) =>
              syntax.actions.updateMarkerRule(rule.id, { tone })
            }
          />
          <TonePicker
            ariaLabel={`${rule.label}文字色`}
            customToneLabel={syntax.customToneLabel}
            fieldId={createSyntaxRuleFieldId("marker", rule.id, "textColor")}
            options={syntax.toneOptions}
            showLabel={false}
            value={rule.textColor}
            onChange={(textColor) =>
              syntax.actions.updateMarkerRule(rule.id, { textColor })
            }
          />
          <Button
            aria-label="删除块规则"
            onClick={() => syntax.actions.removeMarkerRule(rule.id)}
            type="button"
            variant="icon"
          >
            <Trash2 aria-hidden="true" size={13} />
          </Button>
        </div>
      ))}
      <div className="syntax-rule-actions">
        <Button
          onClick={syntax.actions.addMarkerRule}
          type="button"
          variant="secondary"
        >
          <Plus aria-hidden="true" size={13} />
          新增块规则
        </Button>
      </div>
    </>
  );
}

function InlineRuleRow({
  protectedRuleIds,
  rule,
  syntax,
}: {
  protectedRuleIds: string[];
  rule: UiSyntaxProfileDraftInlineRule;
  syntax: SyntaxViewModel;
}) {
  const isProtected = protectedRuleIds.includes(rule.id);

  return (
    <div
      className="syntax-rule-row"
      data-syntax-field-id={createSyntaxRuleFieldId("inline", rule.id)}
      tabIndex={-1}
    >
      <input
        aria-label="名称"
        className="ui-input"
        data-syntax-field-id={createSyntaxRuleFieldId(
          "inline",
          rule.id,
          "label",
        )}
        maxLength={syntax.constraints.label.maxLength}
        value={rule.label}
        onChange={(event) =>
          syntax.actions.updateInlineRule(rule.id, { label: event.target.value })
        }
      />
      {rule.kind === "paired" ? (
        <div className="syntax-pair-fields">
          <input
            aria-label="开始"
            className="ui-input"
            data-syntax-field-id={createSyntaxRuleFieldId(
              "inline",
              rule.id,
              "open",
            )}
            maxLength={syntax.constraints.token.maxLength}
            value={rule.open}
            onChange={(event) =>
              syntax.actions.updateInlineRule(rule.id, { open: event.target.value })
            }
          />
          <input
            aria-label="结束"
            className="ui-input"
            data-syntax-field-id={createSyntaxRuleFieldId(
              "inline",
              rule.id,
              "close",
            )}
            maxLength={syntax.constraints.token.maxLength}
            value={rule.close}
            onChange={(event) =>
              syntax.actions.updateInlineRule(rule.id, { close: event.target.value })
            }
          />
        </div>
      ) : (
        <input
          aria-label="符号"
          className="ui-input"
          data-syntax-field-id={createSyntaxRuleFieldId(
            "inline",
            rule.id,
            "marker",
          )}
          maxLength={syntax.constraints.token.maxLength}
          value={rule.marker}
          onChange={(event) =>
            syntax.actions.updateInlineRule(rule.id, {
              marker: event.target.value,
            })
          }
        />
      )}
      <span className="syntax-readonly">
        {rule.kind === "paired" ? "成对" : "单个"}
      </span>
      <TonePicker
        ariaLabel={`${rule.label}背景色`}
        customToneLabel={syntax.customToneLabel}
        fieldId={createSyntaxRuleFieldId("inline", rule.id, "tone")}
        options={syntax.toneOptions}
        showLabel={false}
        value={rule.tone}
        onChange={(tone) => syntax.actions.updateInlineRule(rule.id, { tone })}
      />
      <TonePicker
        ariaLabel={`${rule.label}文字色`}
        customToneLabel={syntax.customToneLabel}
        fieldId={createSyntaxRuleFieldId("inline", rule.id, "textColor")}
        options={syntax.toneOptions}
        showLabel={false}
        value={rule.textColor}
        onChange={(textColor) =>
          syntax.actions.updateInlineRule(rule.id, { textColor })
        }
      />
      <Button
        aria-label="删除行内规则"
        disabled={isProtected}
        onClick={() => syntax.actions.removeInlineRule(rule.id)}
        title={isProtected ? "受保护规则" : "删除"}
        type="button"
        variant="icon"
      >
        <Trash2 aria-hidden="true" size={13} />
      </Button>
    </div>
  );
}

export function InlineRuleRows({
  syntax,
}: {
  syntax: SyntaxViewModel;
}) {
  return (
    <>
      {syntax.draft.inlineRules.map((rule) => (
        <InlineRuleRow
          key={rule.id}
          protectedRuleIds={syntax.protectedInlineRuleIds}
          rule={rule}
          syntax={syntax}
        />
      ))}
      <div className="syntax-rule-actions">
        <Button
          onClick={() => syntax.actions.addInlineRule("paired")}
          type="button"
          variant="secondary"
        >
          <Plus aria-hidden="true" size={13} />
          成对符号
        </Button>
        <Button
          onClick={() => syntax.actions.addInlineRule("single")}
          type="button"
          variant="secondary"
        >
          <Plus aria-hidden="true" size={13} />
          单个符号
        </Button>
      </div>
    </>
  );
}
