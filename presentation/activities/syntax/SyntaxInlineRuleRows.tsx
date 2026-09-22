import { Button, InputControl, StatusText } from "compact-ui";
import { Trash2 } from "lucide-react";
import type { AvailableSyntaxViewModel } from "../../../application/syntax/index.ts";
import { createSyntaxRuleFieldId } from "../../../application/syntax/index.ts";

import { SyntaxRuleField, SyntaxRuleFields } from "./SyntaxRuleLayout.tsx";
import { TonePicker } from "./TonePicker.tsx";

function InlineRuleRow({
  protectedRuleIds,
  rule,
  syntax,
}: {
  protectedRuleIds: string[];
  rule: AvailableSyntaxViewModel["draft"]["inline"][number];
  syntax: AvailableSyntaxViewModel;
}) {
  const isProtected = protectedRuleIds.includes(rule.id);
  const triggerProtected = syntax.protectedInlineTriggerRuleIds.includes(
    rule.id,
  );

  return (
    <section
      data-syntax-field-id={createSyntaxRuleFieldId("inline", rule.id)}
      tabIndex={-1}
    >
      <SyntaxRuleFields>
        <SyntaxRuleField label="名称">
          <InputControl
            disabled={!syntax.canMutate}
            aria-label="名称"
            sizing="fill"
            data-syntax-field-id={createSyntaxRuleFieldId(
              "inline",
              rule.id,
              "label",
            )}
            maxLength={syntax.constraints.label.maxLength}
            title={rule.label}
            value={rule.label}
            onChange={(event) =>
              syntax.actions.updateInline(rule.id, {
                label: event.target.value,
              })
            }
          />
        </SyntaxRuleField>
        <SyntaxRuleField label="标记">
          {triggerProtected ? (
            <StatusText>
              {rule.kind === "paired" ? rule.open : rule.marker}
            </StatusText>
          ) : (
            <InputControl
              disabled={!syntax.canMutate}
              aria-label={rule.kind === "paired" ? "开始" : "符号"}
              sizing="fill"
              data-syntax-field-id={createSyntaxRuleFieldId(
                "inline",
                rule.id,
                rule.kind === "paired" ? "open" : "marker",
              )}
              maxLength={syntax.constraints.token.maxCodePoints * 2}
              value={rule.kind === "paired" ? rule.open : rule.marker}
              onChange={(event) =>
                syntax.actions.updateInline(
                  rule.id,
                  rule.kind === "paired"
                    ? { open: event.target.value }
                    : { marker: event.target.value },
                )
              }
            />
          )}
        </SyntaxRuleField>
        <SyntaxRuleField label="结束">
          {rule.kind === "paired" ? (
            triggerProtected ? (
              <StatusText>{rule.close}</StatusText>
            ) : (
              <InputControl
                disabled={!syntax.canMutate}
                aria-label="结束"
                sizing="fill"
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
            )
          ) : (
            <StatusText>—</StatusText>
          )}
        </SyntaxRuleField>
        <SyntaxRuleField label="角色">
          <StatusText>{rule.kind === "paired" ? "成对" : "单个"}</StatusText>
        </SyntaxRuleField>
        <SyntaxRuleField label="颜色">
          <TonePicker
            disabled={!syntax.canMutate}
            ariaLabel={`${rule.label}颜色`}
            customToneLabel={syntax.customToneLabel}
            fieldId={createSyntaxRuleFieldId("inline", rule.id, "tone")}
            options={syntax.toneOptions}
            value={rule.tone}
            onChange={(tone) => syntax.actions.updateInline(rule.id, { tone })}
          />
        </SyntaxRuleField>
        <SyntaxRuleField label="操作">
          {isProtected ? null : (
            <Button
              disabled={!syntax.canMutate}
              tone="danger"
              aria-label="删除行内规则"
              onClick={() => syntax.actions.removeInline(rule.id)}
              title="删除"
              type="button"
              iconOnly
            >
              <Trash2 aria-hidden="true" size={13} />
            </Button>
          )}
        </SyntaxRuleField>
      </SyntaxRuleFields>
    </section>
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
    </>
  );
}
