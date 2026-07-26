import { Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import type { SyntaxViewModel } from "../../../../application/syntax/syntaxViewModel";
import type {
  CtnSyntaxDraftInline,
} from "../../../../core/ctn/syntax/draft";
import type {
  UiSyntaxTone,
} from "../../../../application/workspace/projection/viewSyntax";
import {
  createSyntaxRuleFieldId,
  syntaxFieldIds,
} from "../../../../application/workspace/projection/viewSyntaxFields";
import { Button } from "../../../ui/shared/primitives";
import { TonePicker } from "./TonePicker";
import { SyntaxKindPicker } from "./SyntaxKindPicker";

function SyntaxToneCells({
  backgroundOptions,
  customToneLabel,
  label,
  textColorOptions,
  textColor,
  tone,
  onChange,
}: {
  backgroundOptions: SyntaxViewModel["backgroundToneOptions"];
  customToneLabel: string;
  label: string;
  textColorOptions: SyntaxViewModel["toneOptions"];
  textColor: UiSyntaxTone;
  tone: UiSyntaxTone;
  onChange: (patch: { textColor?: UiSyntaxTone; tone?: UiSyntaxTone }) => void;
}) {
  return (
    <>
      <TonePicker
        ariaLabel={`${label}背景色`}
        customToneLabel={customToneLabel}
        options={backgroundOptions}
        showLabel={false}
        value={tone}
        onChange={(nextTone) => onChange({ tone: nextTone })}
      />
      <TonePicker
        ariaLabel={`${label}文字色`}
        customToneLabel={customToneLabel}
        options={textColorOptions}
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

export function SyntaxRuleHeader({
  inline = false,
}: {
  inline?: boolean;
}) {
  return (
    <div className="syntax-rule-row syntax-rule-header">
      <span>名称</span>
      <span>{inline ? "符号" : "标记"}</span>
      <span>类型</span>
      <span>{inline ? "颜色" : "背景"}</span>
      <span>{inline ? null : "颜色"}</span>
      <span />
    </div>
  );
}

function SyntaxRuleSpacer() {
  return <span aria-hidden="true" className="syntax-rule-spacer" />;
}

export function TitleAndRootRows({
  syntax,
}: {
  syntax: SyntaxViewModel;
}) {
  return (
    <>
      {syntax.selectedTarget.kind === "workspace-file" &&
          syntax.draft.title ? (
        <div
          className="syntax-rule-row"
          data-syntax-field-id={syntaxFieldIds.title}
          tabIndex={-1}
        >
          <span className="syntax-readonly">首行标题</span>
          <span className="syntax-readonly">首行</span>
          <span className="syntax-readonly">标题</span>
          <SyntaxToneCells
            backgroundOptions={syntax.backgroundToneOptions}
            customToneLabel={syntax.customToneLabel}
            label="首行标题"
            textColorOptions={syntax.toneOptions}
            textColor={syntax.draft.title.textColor}
            tone={syntax.draft.title.tone}
            onChange={syntax.actions.updateTitle}
          />
          <SyntaxRuleSpacer />
        </div>
      ) : null}
      {syntax.draft.root && syntax.rootRuleLabel ? (
        <div
          className="syntax-rule-row"
          data-syntax-field-id={syntaxFieldIds.root}
          tabIndex={-1}
        >
          <span className="syntax-readonly">{syntax.rootRuleLabel}</span>
          <span className="syntax-readonly">顶格</span>
          <span className="syntax-readonly">
            {syntax.selectedTarget.kind === "journal" ? "正文" : "概念"}
          </span>
          <SyntaxToneCells
            backgroundOptions={syntax.backgroundToneOptions}
            customToneLabel={syntax.customToneLabel}
            label={syntax.rootRuleLabel}
            textColorOptions={syntax.rootTextColorOptions}
            textColor={syntax.draft.root.textColor}
            tone={syntax.draft.root.tone}
            onChange={syntax.actions.updateRoot}
          />
          <SyntaxRuleSpacer />
        </div>
      ) : null}
    </>
  );
}

export function BlockRuleRows({
  syntax,
}: {
  syntax: SyntaxViewModel;
}) {
  return (
    <>
      {syntax.draft.blocks.map((rule) => {
        const isProtected = syntax.protectedBlockRuleIds.includes(rule.id);
        const isTodoItem = syntax.owner === "todo" &&
          rule.semanticId === "todo-item";

        return (
          <div
            className="syntax-rule-row"
            data-syntax-field-id={createSyntaxRuleFieldId("block", rule.id)}
            key={rule.id}
            tabIndex={-1}
          >
            {isTodoItem
              ? (
                <span className="syntax-readonly">
                  {rule.label}
                </span>
              )
              : (
                <input
                  aria-label="名称"
                  className="ui-input"
                  data-syntax-field-id={createSyntaxRuleFieldId(
                    "block",
                    rule.id,
                    "label",
                  )}
                  maxLength={syntax.constraints.label.maxLength}
                  value={rule.label}
                  onChange={(event) =>
                    syntax.actions.updateBlock(rule.id, {
                      label: event.target.value,
                    })
                  }
                />
              )}
            {isTodoItem
              ? (
                <span className="syntax-readonly">
                  {rule.marker}
                </span>
              )
              : (
                <input
                  aria-label="标记"
                  className="ui-input"
                  data-syntax-field-id={createSyntaxRuleFieldId(
                    "block",
                    rule.id,
                    "marker",
                  )}
                  maxLength={syntax.constraints.token.maxCodePoints * 2}
                  value={rule.marker}
                  onChange={(event) =>
                    syntax.actions.updateBlock(rule.id, {
                      marker: event.target.value,
                    })
                  }
                />
              )}
            {isTodoItem
              ? <span className="syntax-readonly">普通块</span>
              : (
                <SyntaxKindPicker
                  ariaLabel="角色"
                  fieldId={createSyntaxRuleFieldId(
                    "block",
                    rule.id,
                    "kind",
                  )}
                  options={syntax.kindOptions}
                  value={rule.kind}
                  onChange={(kind) =>
                    syntax.actions.updateBlock(rule.id, {
                      kind,
                    })
                  }
                />
              )}
            <TonePicker
              ariaLabel={`${rule.label}背景色`}
              customToneLabel={syntax.customToneLabel}
              fieldId={createSyntaxRuleFieldId(
                "block",
                rule.id,
                "tone",
              )}
              options={syntax.backgroundToneOptions}
              showLabel={false}
              value={rule.tone}
              onChange={(tone) =>
                syntax.actions.updateBlock(rule.id, { tone })
              }
            />
            <TonePicker
              ariaLabel={`${rule.label}${isTodoItem ? "颜色" : "文字色"}`}
              customToneLabel={syntax.customToneLabel}
              fieldId={createSyntaxRuleFieldId("block", rule.id, "textColor")}
              options={syntax.toneOptions}
              showLabel={false}
              value={rule.textColor}
              onChange={(textColor) =>
                syntax.actions.updateBlock(rule.id, { textColor })
              }
            />
            {isProtected
              ? <SyntaxRuleSpacer />
              : (
                <Button
                  aria-label="删除块规则"
                  onClick={() => syntax.actions.removeBlock(rule.id)}
                  type="button"
                  variant="icon"
                >
                  <Trash2 aria-hidden="true" size={13} />
                </Button>
              )}
          </div>
        );
      })}
      <div className="syntax-rule-actions">
        <Button
          onClick={syntax.actions.addBlock}
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
  rule: CtnSyntaxDraftInline;
  syntax: SyntaxViewModel;
}) {
  const isProtected = protectedRuleIds.includes(rule.id);
  const triggerProtected = syntax.protectedInlineTriggerRuleIds.includes(
    rule.id,
  );

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
          syntax.actions.updateInline(rule.id, { label: event.target.value })
        }
      />
      {rule.kind === "paired" ? (
        <div className="syntax-pair-fields">
          {triggerProtected
            ? (
              <>
                <span className="syntax-readonly">{rule.open}</span>
                <span className="syntax-readonly">{rule.close}</span>
              </>
            )
            : (
              <>
                <input
                  aria-label="开始"
                  className="ui-input"
                  data-syntax-field-id={createSyntaxRuleFieldId(
                    "inline",
                    rule.id,
                    "open",
                  )}
                  maxLength={syntax.constraints.token.maxCodePoints * 2}
                  value={rule.open}
                  onChange={(event) =>
                    syntax.actions.updateInline(rule.id, {
                      open: event.target.value,
                    })
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
                  maxLength={syntax.constraints.token.maxCodePoints * 2}
                  value={rule.close}
                  onChange={(event) =>
                    syntax.actions.updateInline(rule.id, {
                      close: event.target.value,
                    })
                  }
                />
              </>
            )}
        </div>
      ) : triggerProtected
        ? <span className="syntax-readonly">{rule.marker}</span>
        : (
          <input
            aria-label="符号"
            className="ui-input"
            data-syntax-field-id={createSyntaxRuleFieldId(
              "inline",
              rule.id,
              "marker",
            )}
            maxLength={syntax.constraints.token.maxCodePoints * 2}
            value={rule.marker}
            onChange={(event) =>
              syntax.actions.updateInline(rule.id, {
                marker: event.target.value,
              })
            }
          />
        )}
      <span className="syntax-readonly">
        {rule.kind === "paired" ? "成对" : "单个"}
      </span>
      <TonePicker
        ariaLabel={`${rule.label}颜色`}
        customToneLabel={syntax.customToneLabel}
        fieldId={createSyntaxRuleFieldId("inline", rule.id, "tone")}
        options={syntax.toneOptions}
        showLabel={false}
        value={rule.tone}
        onChange={(tone) => syntax.actions.updateInline(rule.id, { tone })}
      />
      <SyntaxRuleSpacer />
      {isProtected
        ? <SyntaxRuleSpacer />
        : (
          <Button
            aria-label="删除行内规则"
            onClick={() => syntax.actions.removeInline(rule.id)}
            title="删除"
            type="button"
            variant="icon"
          >
            <Trash2 aria-hidden="true" size={13} />
          </Button>
        )}
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
      {syntax.draft.inline.map((rule) => (
        <InlineRuleRow
          key={rule.id}
          protectedRuleIds={syntax.protectedInlineRuleIds}
          rule={rule}
          syntax={syntax}
        />
      ))}
      <div className="syntax-rule-actions">
        <Button
          onClick={() => syntax.actions.addInline("paired")}
          type="button"
          variant="secondary"
        >
          <Plus aria-hidden="true" size={13} />
          成对符号
        </Button>
        <Button
          onClick={() => syntax.actions.addInline("single")}
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
