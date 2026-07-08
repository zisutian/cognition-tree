import { Plus, Trash2 } from "lucide-react";
import type { ViewModel } from "../../../application/workspace/view-model/useViewModel";
import type {
  UiSyntaxProfileDraftInlineRule,
  UiSyntaxTone,
} from "../../../application/workspace/projection/viewSyntax";
import {
  Button,
  Field,
  Panel,
  PanelBody,
  PanelHeader,
  Section,
  StatusLine,
} from "../../shared/primitives";
import {
  TonePicker,
  getToneSwatchClass,
  getToneSwatchStyle,
} from "./TonePicker";

const maxTabDisplayWidth = 16;

function readTabDisplayWidthInput(value: string) {
  const digits = value.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  return String(
    Math.min(maxTabDisplayWidth, Math.max(1, Number.parseInt(digits, 10))),
  );
}

function ToneFields({
  label,
  options,
  textColor,
  tone,
  onChange,
}: {
  label: string;
  options: ViewModel["syntax"]["toneOptions"];
  textColor: UiSyntaxTone;
  tone: UiSyntaxTone;
  onChange: (patch: { textColor?: UiSyntaxTone; tone?: UiSyntaxTone }) => void;
}) {
  return (
    <div className="syntax-tone-fields">
      <span>{label}</span>
      <TonePicker
        ariaLabel={`${label}背景色`}
        options={options}
        value={tone}
        onChange={(nextTone) => onChange({ tone: nextTone })}
      />
      <TonePicker
        ariaLabel={`${label}文字色`}
        options={options}
        value={textColor}
        onChange={(nextColor) => onChange({ textColor: nextColor })}
      />
    </div>
  );
}

function InlineRuleRow({
  protectedRuleIds,
  rule,
  syntax,
}: {
  protectedRuleIds: string[];
  rule: UiSyntaxProfileDraftInlineRule;
  syntax: ViewModel["syntax"];
}) {
  const isProtected = protectedRuleIds.includes(rule.id);

  return (
    <div className="syntax-row syntax-inline-row">
      <input
        aria-label="名称"
        value={rule.label}
        maxLength={32}
        onChange={(event) =>
          syntax.actions.updateInlineRule(rule.id, { label: event.target.value })
        }
      />
      {rule.kind === "paired" ? (
        <>
          <input
            aria-label="开始"
            maxLength={12}
            value={rule.open}
            onChange={(event) =>
              syntax.actions.updateInlineRule(rule.id, { open: event.target.value })
            }
          />
          <input
            aria-label="结束"
            maxLength={12}
            value={rule.close}
            onChange={(event) =>
              syntax.actions.updateInlineRule(rule.id, { close: event.target.value })
            }
          />
        </>
      ) : (
        <>
          <input
            aria-label="符号"
            maxLength={12}
            value={rule.marker}
            onChange={(event) =>
              syntax.actions.updateInlineRule(rule.id, {
                marker: event.target.value,
              })
            }
          />
          <span className="syntax-readonly">单个符号</span>
        </>
      )}
      <TonePicker
        ariaLabel={`${rule.label}背景色`}
        options={syntax.toneOptions}
        value={rule.tone}
        onChange={(tone) => syntax.actions.updateInlineRule(rule.id, { tone })}
      />
      <TonePicker
        ariaLabel={`${rule.label}文字色`}
        options={syntax.toneOptions}
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

export function SyntaxSetupPanel({
  errorMessage,
  onConfigureSyntax,
  onUseDefaultSyntax,
}: {
  errorMessage: string;
  onConfigureSyntax: () => void;
  onUseDefaultSyntax: () => void;
}) {
  return (
    <Panel className="syntax-setup-panel" aria-label="仓库语法未配置">
      <PanelHeader title="仓库语法未配置" />
      <PanelBody>
        <p className="ui-muted">配置语法后可以解析笔记、迁移结构和引用图谱。</p>
        {errorMessage ? <StatusLine tone="error">{errorMessage}</StatusLine> : null}
        <div className="ui-actions">
          <Button onClick={onConfigureSyntax} type="button" variant="primary">
            打开语法
          </Button>
          <Button onClick={onUseDefaultSyntax} type="button" variant="secondary">
            使用默认语法
          </Button>
        </div>
      </PanelBody>
    </Panel>
  );
}

export function SyntaxMainPanel({ view }: { view: ViewModel }) {
  const { syntax } = view;

  return (
    <Panel className="syntax-panel" aria-label="语法配置">
      <PanelHeader title="语法配置" />
      <PanelBody scroll>
        {syntax.feedback ? (
          <StatusLine tone={syntax.feedback.status}>{syntax.feedback.message}</StatusLine>
        ) : null}
        <Section className="syntax-grid-section" title="配置">
          <Field label="名称">
            <input
              maxLength={64}
              value={syntax.draft.name}
              onChange={(event) =>
                syntax.actions.updateDraftField("name", event.target.value)
              }
            />
          </Field>
          <Field label="缩进宽度">
            <input
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
          </Field>
        </Section>
        <Section title="块规则">
          <ToneFields
            label="首行标题"
            options={syntax.toneOptions}
            textColor={syntax.draft.titleRule.textColor}
            tone={syntax.draft.titleRule.tone}
            onChange={syntax.actions.updateTitleRule}
          />
          <ToneFields
            label="顶格概念"
            options={syntax.toneOptions}
            textColor={syntax.draft.conceptRule.textColor}
            tone={syntax.draft.conceptRule.tone}
            onChange={syntax.actions.updateConceptRule}
          />
          <div className="syntax-row syntax-block-header">
            <span>类型</span>
            <span>标记</span>
            <span>角色</span>
            <span>背景色</span>
            <span>文字色</span>
            <span />
          </div>
          {syntax.draft.markerRules.map((rule) => (
            <div className="syntax-row syntax-block-row" key={rule.id}>
              <input
                aria-label="名称"
                maxLength={32}
                value={rule.label}
                onChange={(event) =>
                  syntax.actions.updateMarkerRule(rule.id, {
                    label: event.target.value,
                  })
                }
              />
              <input
                aria-label="标记"
                maxLength={12}
                value={rule.marker}
                onChange={(event) =>
                  syntax.actions.updateMarkerRule(rule.id, {
                    marker: event.target.value,
                  })
                }
              />
              <select
                aria-label="角色"
                value={rule.role}
                onChange={(event) =>
                  syntax.actions.updateMarkerRule(rule.id, {
                    role: event.target.value as typeof rule.role,
                  })
                }
              >
                {syntax.roleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <TonePicker
                ariaLabel={`${rule.label}背景色`}
                options={syntax.toneOptions}
                value={rule.tone}
                onChange={(tone) =>
                  syntax.actions.updateMarkerRule(rule.id, { tone })
                }
              />
              <TonePicker
                ariaLabel={`${rule.label}文字色`}
                options={syntax.toneOptions}
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
          <Button
            className="syntax-add-rule-button"
            onClick={syntax.actions.addMarkerRule}
            type="button"
            variant="secondary"
          >
            <Plus aria-hidden="true" size={13} />
            新增块规则
          </Button>
        </Section>
        <Section title="行内规则">
          <div className="syntax-row syntax-inline-header">
            <span>名称</span>
            <span>开始/符号</span>
            <span>结束</span>
            <span>背景色</span>
            <span>文字色</span>
            <span />
          </div>
          {syntax.draft.inlineRules.map((rule) => (
            <InlineRuleRow
              key={rule.id}
              protectedRuleIds={syntax.protectedInlineRuleIds}
              rule={rule}
              syntax={syntax}
            />
          ))}
          <div className="ui-actions">
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
        </Section>
      </PanelBody>
    </Panel>
  );
}

function SyntaxTonePreview({
  label,
  textColor,
  tone,
}: {
  label: string;
  textColor: UiSyntaxTone;
  tone: UiSyntaxTone;
}) {
  return (
    <div className="syntax-preview-row">
      <span>{label}</span>
      <span className="syntax-preview-swatches">
        <span
          aria-label="背景色"
          className={getToneSwatchClass(tone)}
          role="img"
          style={getToneSwatchStyle(tone)}
        >
          <span />
        </span>
        <span
          aria-label="文字色"
          className={getToneSwatchClass(textColor)}
          role="img"
          style={getToneSwatchStyle(textColor)}
        >
          <span />
        </span>
      </span>
    </div>
  );
}

export function SyntaxDetailPanel({
  onCollapseDetail,
  view,
}: {
  onCollapseDetail: () => void;
  view: ViewModel;
}) {
  return (
    <Panel aria-label="语法详情" as="aside" tone="detail">
      <PanelHeader
        title="状态"
        actions={
          <Button aria-label="收回右侧详情" onClick={onCollapseDetail} type="button" variant="icon">
            ×
          </Button>
        }
      />
      <PanelBody scroll>
        <Section title="当前配置">
          <dl className="detail-list">
            <div>
              <dt>名称</dt>
              <dd>{view.syntax.draftResult.profile?.name ?? view.syntax.draft.name}</dd>
            </div>
            <div>
              <dt>缩进宽度</dt>
              <dd>
                {view.syntax.draftResult.profile?.tabDisplayWidth ??
                  view.syntax.draft.tabDisplayWidth}
              </dd>
            </div>
          </dl>
        </Section>
        <Section title="语法可视化">
          <div className="syntax-preview-list">
            <SyntaxTonePreview
              label="首行标题"
              textColor={view.syntax.draft.titleRule.textColor}
              tone={view.syntax.draft.titleRule.tone}
            />
            <SyntaxTonePreview
              label="顶格概念"
              textColor={view.syntax.draft.conceptRule.textColor}
              tone={view.syntax.draft.conceptRule.tone}
            />
            {view.syntax.draft.markerRules.map((rule) => (
              <SyntaxTonePreview
                key={rule.id}
                label={rule.label}
                textColor={rule.textColor}
                tone={rule.tone}
              />
            ))}
            {view.syntax.draft.inlineRules.map((rule) => (
              <SyntaxTonePreview
                key={rule.id}
                label={rule.label}
                textColor={rule.textColor}
                tone={rule.tone}
              />
            ))}
          </div>
        </Section>
      </PanelBody>
    </Panel>
  );
}
