import { Check, ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import type { ViewModel } from "../../../application/workspace/view-model/useViewModel";
import type {
  UiSyntaxProfileDraftInlineRule,
  UiSyntaxRole,
  UiSyntaxTone,
} from "../../../application/workspace/projection/viewSyntax";
import {
  Button,
  Panel,
  PanelBody,
  PanelHeader,
  StatusLine,
  cx,
} from "../../shared/primitives";
import { SyntaxDropdown, TonePicker } from "./TonePicker";

const maxTabDisplayWidth = 16;
const customTonePattern = /^#[0-9a-fA-F]{6}$/;

function readTabDisplayWidthInput(value: string) {
  const digits = value.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  return String(
    Math.min(maxTabDisplayWidth, Math.max(1, Number.parseInt(digits, 10))),
  );
}

function isCustomTone(tone: UiSyntaxTone) {
  return customTonePattern.test(tone);
}

function getRenderToneClass(tone: UiSyntaxTone) {
  return isCustomTone(tone)
    ? "syntax-render-tone-custom"
    : `syntax-render-tone-${tone}`;
}

function getRenderTextColorClass(tone: UiSyntaxTone) {
  return isCustomTone(tone)
    ? "syntax-render-text-custom"
    : `syntax-render-text-${tone}`;
}

function getRenderStyle({
  textColor,
  tone,
}: {
  textColor: UiSyntaxTone;
  tone: UiSyntaxTone;
}): CSSProperties | undefined {
  const style: Record<string, string> = {};

  if (isCustomTone(tone)) {
    style["--syntax-render-tone-color"] = tone;
  }

  if (isCustomTone(textColor)) {
    style["--syntax-render-text-color"] = textColor;
  }

  return Object.keys(style).length > 0 ? (style as CSSProperties) : undefined;
}

function SyntaxToneCells({
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
    <>
      <TonePicker
        ariaLabel={`${label}背景色`}
        options={options}
        showLabel={false}
        value={tone}
        onChange={(nextTone) => onChange({ tone: nextTone })}
      />
      <TonePicker
        ariaLabel={`${label}文字色`}
        options={options}
        showLabel={false}
        value={textColor}
        onChange={(nextColor) => onChange({ textColor: nextColor })}
      />
    </>
  );
}

function SyntaxSettingsGroup({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div className="syntax-settings-group" aria-label={title}>
      <div className="syntax-group-label">
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

function SyntaxRuleHeader() {
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

function SyntaxRolePicker({
  ariaLabel,
  options,
  value,
  onChange,
}: {
  ariaLabel: string;
  options: ViewModel["syntax"]["roleOptions"];
  value: UiSyntaxRole;
  onChange: (role: UiSyntaxRole) => void;
}) {
  const selectedOption =
    options.find((option) => option.value === value) ?? {
      label: value,
      value,
    };

  return (
    <SyntaxDropdown
      ariaLabel={ariaLabel}
      className="syntax-role-picker"
      menuClassName="syntax-dropdown-menu syntax-role-menu"
      renderButton={({ isOpen, menuId, toggle }) => (
        <button
          aria-controls={menuId}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          aria-label={`${ariaLabel}: ${selectedOption.label}`}
          className="syntax-role-button"
          onClick={toggle}
          type="button"
        >
          <span>{selectedOption.label}</span>
          <ChevronDown aria-hidden="true" size={13} strokeWidth={2} />
        </button>
      )}
    >
      {({ close }) => (
        <div className="syntax-role-list" role="listbox">
          {options.map((option) => {
            const isSelected = option.value === value;

            return (
              <button
                aria-selected={isSelected}
                className={
                  isSelected
                    ? "syntax-role-option is-selected"
                    : "syntax-role-option"
                }
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  close();
                }}
                role="option"
                type="button"
              >
                <span>{option.label}</span>
                {isSelected ? (
                  <Check aria-hidden="true" size={12} strokeWidth={2.4} />
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </SyntaxDropdown>
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
    <div className="syntax-rule-row">
      <input
        aria-label="名称"
        value={rule.label}
        maxLength={32}
        onChange={(event) =>
          syntax.actions.updateInlineRule(rule.id, { label: event.target.value })
        }
      />
      {rule.kind === "paired" ? (
        <div className="syntax-pair-fields">
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
        </div>
      ) : (
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
      )}
      <span className="syntax-readonly">
        {rule.kind === "paired" ? "成对" : "单个"}
      </span>
      <TonePicker
        ariaLabel={`${rule.label}背景色`}
        options={syntax.toneOptions}
        showLabel={false}
        value={rule.tone}
        onChange={(tone) => syntax.actions.updateInlineRule(rule.id, { tone })}
      />
      <TonePicker
        ariaLabel={`${rule.label}文字色`}
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
        <div className="syntax-settings-stack" aria-label="语法设置">
          <SyntaxSettingsGroup title="基础">
            <label className="syntax-setting-line">
              <span className="syntax-setting-label">名称</span>
              <input
                aria-label="语法名称"
                className="syntax-name-control"
                maxLength={64}
                value={syntax.draft.name}
                onChange={(event) =>
                  syntax.actions.updateDraftField("name", event.target.value)
                }
              />
            </label>
            <label className="syntax-setting-line">
              <span className="syntax-setting-label">缩进宽度</span>
              <input
                aria-label="缩进宽度"
                className="syntax-number-control"
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
            </label>
          </SyntaxSettingsGroup>
          <SyntaxSettingsGroup title="块规则">
            <SyntaxRuleHeader />
            <div className="syntax-rule-row">
              <span className="syntax-readonly">首行标题</span>
              <span className="syntax-readonly">首行</span>
              <span className="syntax-readonly">标题</span>
              <SyntaxToneCells
                label="首行标题"
                options={syntax.toneOptions}
                textColor={syntax.draft.titleRule.textColor}
                tone={syntax.draft.titleRule.tone}
                onChange={syntax.actions.updateTitleRule}
              />
              <SyntaxRuleSpacer />
            </div>
            <div className="syntax-rule-row">
              <span className="syntax-readonly">顶格概念</span>
              <span className="syntax-readonly">顶格</span>
              <span className="syntax-readonly">概念</span>
              <SyntaxToneCells
                label="顶格概念"
                options={syntax.toneOptions}
                textColor={syntax.draft.conceptRule.textColor}
                tone={syntax.draft.conceptRule.tone}
                onChange={syntax.actions.updateConceptRule}
              />
              <SyntaxRuleSpacer />
            </div>
            {syntax.draft.markerRules.map((rule) => (
              <div className="syntax-rule-row" key={rule.id}>
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
                <SyntaxRolePicker
                  ariaLabel="角色"
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
                  options={syntax.toneOptions}
                  showLabel={false}
                  value={rule.tone}
                  onChange={(tone) =>
                    syntax.actions.updateMarkerRule(rule.id, { tone })
                  }
                />
                <TonePicker
                  ariaLabel={`${rule.label}文字色`}
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
          </SyntaxSettingsGroup>
          <SyntaxSettingsGroup title="行内规则">
            <SyntaxRuleHeader />
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
          </SyntaxSettingsGroup>
        </div>
      </PanelBody>
    </Panel>
  );
}

function SyntaxRenderLine({
  inline = false,
  marker,
  textColor,
  tone,
  value,
}: {
  inline?: boolean;
  marker: string;
  textColor: UiSyntaxTone;
  tone: UiSyntaxTone;
  value: string;
}) {
  return (
    <div
      className={cx(
        "syntax-render-line",
        getRenderToneClass(tone),
        getRenderTextColorClass(textColor),
      )}
      style={getRenderStyle({ textColor, tone })}
    >
      <span className="syntax-render-marker">{marker}</span>
      <span className={cx("syntax-render-text", inline && "syntax-render-inline")}>
        {value}
      </span>
    </div>
  );
}

function getInlinePreviewValue(rule: UiSyntaxProfileDraftInlineRule) {
  return rule.label || "行内规则";
}

function getInlinePreviewMarker(rule: UiSyntaxProfileDraftInlineRule) {
  return rule.kind === "paired"
    ? `${rule.open || "{"}${rule.close || "}"}`
    : rule.marker || "*";
}

export function SyntaxDetailPanel({
  onCollapseDetail,
  view,
}: {
  onCollapseDetail: () => void;
  view: ViewModel;
}) {
  return (
    <Panel aria-label="语法预览" as="aside" tone="detail">
      <PanelHeader
        title="语法预览"
        actions={
          <Button
            aria-label="收回右侧详情"
            onClick={onCollapseDetail}
            title="收回右侧详情"
            type="button"
            variant="icon"
          >
            <ChevronRight aria-hidden="true" size={14} />
          </Button>
        }
      />
      <PanelBody className="detail-panel-stack" scroll>
        <div aria-label="语法预览内容" className="syntax-render-list">
          <SyntaxRenderLine
            marker="T"
            textColor={view.syntax.draft.titleRule.textColor}
            tone={view.syntax.draft.titleRule.tone}
            value="首行标题示例"
          />
          <SyntaxRenderLine
            marker="C"
            textColor={view.syntax.draft.conceptRule.textColor}
            tone={view.syntax.draft.conceptRule.tone}
            value="顶格概念示例"
          />
          {view.syntax.draft.markerRules.map((rule) => (
            <SyntaxRenderLine
              key={rule.id}
              marker={rule.marker || "·"}
              textColor={rule.textColor}
              tone={rule.tone}
              value={`${rule.label}示例`}
            />
          ))}
          {view.syntax.draft.inlineRules.map((rule) => (
            <SyntaxRenderLine
              inline
              key={rule.id}
              marker={getInlinePreviewMarker(rule)}
              textColor={rule.textColor}
              tone={rule.tone}
              value={getInlinePreviewValue(rule)}
            />
          ))}
        </div>
      </PanelBody>
    </Panel>
  );
}
