import { Plus, Trash2 } from "lucide-react";
import type { ViewModel } from "../../../application/workspace/view-model/useViewModel";
import type {
  UiSyntaxProfileDraftInlineRule,
  UiSyntaxTone,
} from "../../../application/workspace/projection/viewSyntax";
import {
  Button,
  Field,
  Metrics,
  Panel,
  PanelBody,
  PanelHeader,
  Section,
  StatusLine,
} from "../../shared/primitives";

function ToneSelect({
  options,
  value,
  onChange,
}: {
  options: ViewModel["syntax"]["toneOptions"];
  value: UiSyntaxTone;
  onChange: (value: UiSyntaxTone) => void;
}) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
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
      <ToneSelect
        options={options}
        value={tone}
        onChange={(nextTone) => onChange({ tone: nextTone })}
      />
      <ToneSelect
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
        onChange={(event) =>
          syntax.actions.updateInlineRule(rule.id, { label: event.target.value })
        }
      />
      {rule.kind === "paired" ? (
        <>
          <input
            aria-label="开始"
            value={rule.open}
            onChange={(event) =>
              syntax.actions.updateInlineRule(rule.id, { open: event.target.value })
            }
          />
          <input
            aria-label="结束"
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
      <ToneSelect
        options={syntax.toneOptions}
        value={rule.tone}
        onChange={(tone) => syntax.actions.updateInlineRule(rule.id, { tone })}
      />
      <ToneSelect
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
      <PanelBody>
        {syntax.feedback ? (
          <StatusLine tone={syntax.feedback.status}>{syntax.feedback.message}</StatusLine>
        ) : null}
        <Section className="syntax-grid-section" title="配置">
          <Field label="名称">
            <input
              value={syntax.draft.name}
              onChange={(event) =>
                syntax.actions.updateDraftField("name", event.target.value)
              }
            />
          </Field>
          <Field label="缩进宽度">
            <input
              value={syntax.draft.tabDisplayWidth}
              onChange={(event) =>
                syntax.actions.updateDraftField(
                  "tabDisplayWidth",
                  event.target.value,
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
                value={rule.label}
                onChange={(event) =>
                  syntax.actions.updateMarkerRule(rule.id, {
                    label: event.target.value,
                  })
                }
              />
              <input
                aria-label="标记"
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
              <ToneSelect
                options={syntax.toneOptions}
                value={rule.tone}
                onChange={(tone) =>
                  syntax.actions.updateMarkerRule(rule.id, { tone })
                }
              />
              <ToneSelect
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
          <Button onClick={syntax.actions.addMarkerRule} type="button" variant="secondary">
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
      <PanelBody>
        <Metrics
          aria-label="语法统计"
          items={[
            { label: "块规则", value: view.syntax.stats.lineRuleCount },
            { label: "行内规则", value: view.syntax.stats.inlineRuleCount },
            { label: "问题", value: view.syntax.draftResult.diagnostics.length },
          ]}
        />
        <Section title="当前配置">
          {view.syntax.draftResult.profile ? (
            <dl className="detail-list">
              <div>
                <dt>名称</dt>
                <dd>{view.syntax.draftResult.profile.name}</dd>
              </div>
              <div>
                <dt>缩进宽度</dt>
                <dd>{view.syntax.draftResult.profile.tabDisplayWidth}</dd>
              </div>
            </dl>
          ) : (
            <p className="ui-muted">当前配置无效</p>
          )}
        </Section>
        <Section title="问题">
          {view.syntax.draftResult.diagnostics.length > 0 ? (
            <ul className="dense-list">
              {view.syntax.draftResult.diagnostics.map((diagnostic) => (
                <li key={`${diagnostic.path}-${diagnostic.message}`}>
                  <span>{diagnostic.path}</span>
                  {diagnostic.message}
                </li>
              ))}
            </ul>
          ) : (
            <p className="ui-muted">没有问题。</p>
          )}
        </Section>
      </PanelBody>
    </Panel>
  );
}
