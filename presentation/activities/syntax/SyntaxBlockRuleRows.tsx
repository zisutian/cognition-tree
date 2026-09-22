import { Button, InputControl, FormActions, StatusText } from "compact-ui";
import { Plus, Trash2 } from "lucide-react";
import type { AvailableSyntaxViewModel } from "../../../application/syntax/index.ts";

import {
  createSyntaxRuleFieldId,
  syntaxFieldIds,
} from "../../../application/syntax/index.ts";

import { SyntaxKindPicker } from "./SyntaxKindPicker.tsx";
import { SyntaxRuleField, SyntaxRuleFields } from "./SyntaxRuleLayout.tsx";
import { TonePicker } from "./TonePicker.tsx";

export function TitleAndRootRows({
  syntax,
}: {
  syntax: AvailableSyntaxViewModel;
}) {
  return (
    <>
      {syntax.selectedTarget.kind === "workspace-file" && syntax.draft.title ? (
        <section data-syntax-field-id={syntaxFieldIds.title} tabIndex={-1}>
          <SyntaxRuleFields>
            <SyntaxRuleField label="名称">
              <StatusText>首行标题</StatusText>
            </SyntaxRuleField>
            <SyntaxRuleField label="标记">
              <StatusText>首行</StatusText>
            </SyntaxRuleField>
            <SyntaxRuleField label="角色">
              <StatusText>标题</StatusText>
            </SyntaxRuleField>
            <SyntaxRuleField label="背景色">
              <TonePicker
                disabled={!syntax.canMutate}
                ariaLabel={"首行标题背景色"}
                customToneLabel={syntax.customToneLabel}
                options={syntax.backgroundToneOptions}
                value={syntax.draft.title.tone}
                onChange={(tone) => syntax.actions.updateTitle({ tone })}
              />
            </SyntaxRuleField>
            <SyntaxRuleField label="文字色">
              <TonePicker
                disabled={!syntax.canMutate}
                ariaLabel={"首行标题文字色"}
                customToneLabel={syntax.customToneLabel}
                options={syntax.toneOptions}
                value={syntax.draft.title.textColor}
                onChange={(textColor) =>
                  syntax.actions.updateTitle({ textColor })
                }
              />
            </SyntaxRuleField>
          </SyntaxRuleFields>
        </section>
      ) : null}
      {syntax.draft.root && syntax.rootRuleLabel ? (
        <section data-syntax-field-id={syntaxFieldIds.root} tabIndex={-1}>
          <SyntaxRuleFields>
            <SyntaxRuleField label="名称">
              <StatusText>{syntax.rootRuleLabel}</StatusText>
            </SyntaxRuleField>
            <SyntaxRuleField label="标记">
              <StatusText>顶格</StatusText>
            </SyntaxRuleField>
            <SyntaxRuleField label="角色">
              <StatusText>
                {syntax.selectedTarget.kind === "journal" ? "正文" : "概念"}
              </StatusText>
            </SyntaxRuleField>
            <SyntaxRuleField label="背景色">
              <TonePicker
                disabled={!syntax.canMutate}
                ariaLabel={`${syntax.rootRuleLabel}背景色`}
                customToneLabel={syntax.customToneLabel}
                options={syntax.backgroundToneOptions}
                value={syntax.draft.root.tone}
                onChange={(tone) => syntax.actions.updateRoot({ tone })}
              />
            </SyntaxRuleField>
            <SyntaxRuleField label="文字色">
              <TonePicker
                disabled={!syntax.canMutate}
                ariaLabel={`${syntax.rootRuleLabel}文字色`}
                customToneLabel={syntax.customToneLabel}
                options={syntax.rootTextColorOptions}
                value={syntax.draft.root.textColor}
                onChange={(textColor) =>
                  syntax.actions.updateRoot({ textColor })
                }
              />
            </SyntaxRuleField>
          </SyntaxRuleFields>
        </section>
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
        const isTodoItem =
          syntax.owner === "todo" && rule.semanticId === "todo-item";

        return (
          <section
            data-syntax-field-id={createSyntaxRuleFieldId("block", rule.id)}
            key={rule.id}
            tabIndex={-1}
          >
            <SyntaxRuleFields>
              <SyntaxRuleField label="名称">
                {isTodoItem ? (
                  <StatusText>{rule.label}</StatusText>
                ) : (
                  <InputControl
                    disabled={!syntax.canMutate}
                    aria-label="名称"
                    sizing="fill"
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
              </SyntaxRuleField>
              <SyntaxRuleField label="标记">
                {isTodoItem ? (
                  <StatusText>{rule.marker}</StatusText>
                ) : (
                  <InputControl
                    disabled={!syntax.canMutate}
                    aria-label="标记"
                    sizing="fill"
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
              </SyntaxRuleField>
              <SyntaxRuleField label="角色">
                {isTodoItem ? (
                  <StatusText>普通块</StatusText>
                ) : (
                  <SyntaxKindPicker
                    disabled={!syntax.canMutate}
                    ariaLabel={`${rule.label}角色`}
                    fieldId={createSyntaxRuleFieldId("block", rule.id, "kind")}
                    options={syntax.kindOptions}
                    value={rule.kind}
                    onChange={(kind) =>
                      syntax.actions.updateBlock(rule.id, {
                        kind,
                      })
                    }
                  />
                )}
              </SyntaxRuleField>
              <SyntaxRuleField label="背景色">
                <TonePicker
                  disabled={!syntax.canMutate}
                  ariaLabel={`${rule.label}背景色`}
                  customToneLabel={syntax.customToneLabel}
                  fieldId={createSyntaxRuleFieldId("block", rule.id, "tone")}
                  options={syntax.backgroundToneOptions}
                  value={rule.tone}
                  onChange={(tone) =>
                    syntax.actions.updateBlock(rule.id, { tone })
                  }
                />
              </SyntaxRuleField>
              <SyntaxRuleField label="文字色">
                <TonePicker
                  disabled={!syntax.canMutate}
                  ariaLabel={`${rule.label}${isTodoItem ? "颜色" : "文字色"}`}
                  customToneLabel={syntax.customToneLabel}
                  fieldId={createSyntaxRuleFieldId(
                    "block",
                    rule.id,
                    "textColor",
                  )}
                  options={syntax.toneOptions}
                  value={rule.textColor}
                  onChange={(textColor) =>
                    syntax.actions.updateBlock(rule.id, { textColor })
                  }
                />
              </SyntaxRuleField>
              <SyntaxRuleField label="操作">
                {isProtected ? null : (
                  <Button
                    disabled={!syntax.canMutate}
                    tone="danger"
                    aria-label="删除块规则"
                    onClick={() => syntax.actions.removeBlock(rule.id)}
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
      })}
      <FormActions>
        <Button
          disabled={!syntax.canMutate}
          onClick={syntax.actions.addBlock}
          type="button"
        >
          <Plus aria-hidden="true" size={13} />
          新增块规则
        </Button>
      </FormActions>
    </>
  );
}
