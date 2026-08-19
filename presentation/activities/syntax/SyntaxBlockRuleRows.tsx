import { Plus, Trash2 } from "lucide-react";
import type {
  AvailableSyntaxViewModel,
} from "../../../application/syntax/syntaxViewModel";
import type {
  UiSyntaxTone,
} from "../../../application/workspace/projection/viewSyntax";
import {
  createSyntaxRuleFieldId,
  syntaxFieldIds,
} from "../../../application/workspace/projection/viewSyntaxFields";
import { Button } from "../../ui/shared/primitives";
import { SyntaxKindPicker } from "./SyntaxKindPicker";
import { SyntaxRuleSpacer } from "./SyntaxRuleLayout";
import { TonePicker } from "./TonePicker";

function SyntaxToneCells({
  backgroundOptions,
  customToneLabel,
  label,
  textColorOptions,
  textColor,
  tone,
  onChange,
}: {
  backgroundOptions: AvailableSyntaxViewModel["backgroundToneOptions"];
  customToneLabel: string;
  label: string;
  textColorOptions: AvailableSyntaxViewModel["toneOptions"];
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

export function TitleAndRootRows({
  syntax,
}: {
  syntax: AvailableSyntaxViewModel;
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
  syntax: AvailableSyntaxViewModel;
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
