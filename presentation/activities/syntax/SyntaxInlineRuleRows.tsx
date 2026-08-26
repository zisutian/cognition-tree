import { Plus, Trash2 } from "lucide-react";
import type {
  AvailableSyntaxViewModel,
} from "../../../application/syntax/syntaxViewModel";
import type {
  CtnSyntaxDraftInline,
} from "../../../core/ctn/syntax/draft";
import {
  createSyntaxRuleFieldId,
} from "../../../application/workspace/projection/viewSyntaxFields";
import { Button } from "../../ui/shared/primitives";
import { InputControl } from "../../ui/shared/controls";
import { SyntaxRuleSpacer } from "./SyntaxRuleLayout";
import { TonePicker } from "./TonePicker";

function InlineRuleRow({
  protectedRuleIds,
  rule,
  syntax,
}: {
  protectedRuleIds: string[];
  rule: CtnSyntaxDraftInline;
  syntax: AvailableSyntaxViewModel;
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
      <InputControl
        aria-label="名称"
        sizing="container"
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
                <InputControl
                  aria-label="开始"
                  sizing="container"
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
                <InputControl
                  aria-label="结束"
                  sizing="container"
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
          <InputControl
            aria-label="符号"
            sizing="container"
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
  syntax: AvailableSyntaxViewModel;
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
