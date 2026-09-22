import {
  Button,
  InputControl,
  FormActions,
  Stack,
  StatusText,
} from "compact-ui";
import { Plus, Trash2 } from "lucide-react";
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
            value={rule.label}
            onChange={(event) =>
              syntax.actions.updateInline(rule.id, {
                label: event.target.value,
              })
            }
          />
        </SyntaxRuleField>
        <SyntaxRuleField label="标记">
          {rule.kind === "paired" ? (
            <Stack direction="row" gap="tight">
              {triggerProtected ? (
                <>
                  <StatusText>{rule.open}</StatusText>
                  <StatusText>{rule.close}</StatusText>
                </>
              ) : (
                <>
                  <InputControl
                    disabled={!syntax.canMutate}
                    aria-label="开始"
                    sizing="fill"
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
                </>
              )}
            </Stack>
          ) : triggerProtected ? (
            <StatusText>{rule.marker}</StatusText>
          ) : (
            <InputControl
              disabled={!syntax.canMutate}
              aria-label="符号"
              sizing="fill"
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
      <FormActions>
        <Button
          disabled={!syntax.canMutate}
          onClick={() => syntax.actions.addInline("paired")}
          type="button"
        >
          <Plus aria-hidden="true" size={13} />
          成对符号
        </Button>
        <Button
          disabled={!syntax.canMutate}
          onClick={() => syntax.actions.addInline("single")}
          type="button"
        >
          <Plus aria-hidden="true" size={13} />
          单个符号
        </Button>
      </FormActions>
    </>
  );
}
