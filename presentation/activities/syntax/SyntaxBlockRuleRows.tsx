import {
  Button,
  InputControl,
  FormActions,
  FormLayout,
  Stack,
  StatusText,
} from "compact-ui";
import { Plus, Trash2 } from "lucide-react";
import type {
  AvailableSyntaxViewModel,
  SyntaxTone,
} from "../../../application/syntax/index.ts";

import {
  createSyntaxRuleFieldId,
  syntaxFieldIds,
} from "../../../application/syntax/index.ts";

import { SyntaxKindPicker } from "./SyntaxKindPicker.tsx";
import { SyntaxRuleField } from "./SyntaxRuleLayout.tsx";
import { TonePicker } from "./TonePicker.tsx";

function SyntaxToneCells({
  disabled,
  backgroundOptions,
  customToneLabel,
  label,
  textColorOptions,
  textColor,
  tone,
  onChange,
}: {
  disabled: boolean;
  backgroundOptions: AvailableSyntaxViewModel["backgroundToneOptions"];
  customToneLabel: string;
  label: string;
  textColorOptions: AvailableSyntaxViewModel["toneOptions"];
  textColor: SyntaxTone;
  tone: SyntaxTone;
  onChange: (patch: { textColor?: SyntaxTone; tone?: SyntaxTone }) => void;
}) {
  return (
    <Stack direction="row" wrap>
      <TonePicker
        disabled={disabled}
        ariaLabel={`${label}背景色`}
        customToneLabel={customToneLabel}
        options={backgroundOptions}
        showLabel={false}
        value={tone}
        onChange={(nextTone) => onChange({ tone: nextTone })}
      />
      <TonePicker
        disabled={disabled}
        ariaLabel={`${label}文字色`}
        customToneLabel={customToneLabel}
        options={textColorOptions}
        showLabel={false}
        value={textColor}
        onChange={(nextColor) => onChange({ textColor: nextColor })}
      />
    </Stack>
  );
}

export function TitleAndRootRows({
  syntax,
}: {
  syntax: AvailableSyntaxViewModel;
}) {
  return (
    <>
      {syntax.selectedTarget.kind === "workspace-file" && syntax.draft.title ? (
        <section data-syntax-field-id={syntaxFieldIds.title} tabIndex={-1}>
          <FormLayout>
            <SyntaxRuleField label="名称">
              <StatusText>首行标题</StatusText>
            </SyntaxRuleField>
            <SyntaxRuleField label="标记">
              <StatusText>首行</StatusText>
            </SyntaxRuleField>
            <SyntaxRuleField label="角色">
              <StatusText>标题</StatusText>
            </SyntaxRuleField>
            <SyntaxRuleField label="颜色">
              <SyntaxToneCells
                disabled={!syntax.canMutate}
                backgroundOptions={syntax.backgroundToneOptions}
                customToneLabel={syntax.customToneLabel}
                label="首行标题"
                textColorOptions={syntax.toneOptions}
                textColor={syntax.draft.title.textColor}
                tone={syntax.draft.title.tone}
                onChange={syntax.actions.updateTitle}
              />
            </SyntaxRuleField>
          </FormLayout>
        </section>
      ) : null}
      {syntax.draft.root && syntax.rootRuleLabel ? (
        <section data-syntax-field-id={syntaxFieldIds.root} tabIndex={-1}>
          <FormLayout>
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
            <SyntaxRuleField label="颜色">
              <SyntaxToneCells
                disabled={!syntax.canMutate}
                backgroundOptions={syntax.backgroundToneOptions}
                customToneLabel={syntax.customToneLabel}
                label={syntax.rootRuleLabel}
                textColorOptions={syntax.rootTextColorOptions}
                textColor={syntax.draft.root.textColor}
                tone={syntax.draft.root.tone}
                onChange={syntax.actions.updateRoot}
              />
            </SyntaxRuleField>
          </FormLayout>
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
            <FormLayout>
              <SyntaxRuleField label="名称">
                {isTodoItem ? (
                  <StatusText>{rule.label}</StatusText>
                ) : (
                  <InputControl
                    disabled={!syntax.canMutate}
                    aria-label="名称"
                    sizing="container"
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
                    sizing="container"
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
                  showLabel={false}
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
                  showLabel={false}
                  value={rule.textColor}
                  onChange={(textColor) =>
                    syntax.actions.updateBlock(rule.id, { textColor })
                  }
                />
              </SyntaxRuleField>
              <FormActions>
                {isProtected ? null : (
                  <Button
                    disabled={!syntax.canMutate}
                    aria-label="删除块规则"
                    onClick={() => syntax.actions.removeBlock(rule.id)}
                    type="button"
                    variant="icon"
                  >
                    <Trash2 aria-hidden="true" size={13} />
                  </Button>
                )}
              </FormActions>
            </FormLayout>
          </section>
        );
      })}
      <FormActions>
        <Button
          disabled={!syntax.canMutate}
          onClick={syntax.actions.addBlock}
          type="button"
          variant="normal"
        >
          <Plus aria-hidden="true" size={13} />
          新增块规则
        </Button>
      </FormActions>
    </>
  );
}
