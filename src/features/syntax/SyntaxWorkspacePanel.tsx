import { Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type {
  CtnPresetSyntaxTone,
  CtnSyntaxTone,
} from "../../syntax/types";
import { isCustomSyntaxTone } from "../../syntax/tones";
import {
  createEmptyInlineRuleDraft,
  createEmptyMarkerRuleDraft,
  isProtectedInlineRuleDraft,
  type SyntaxProfileDraft,
  type SyntaxProfileDraftConceptRule,
  type SyntaxProfileDraftInlineRule,
  type SyntaxProfileDraftMarkerRule,
  syntaxRuleRoles,
  syntaxTones,
} from "./syntaxProfileDraft";

type SyntaxWorkspacePanelProps = {
  draft: SyntaxProfileDraft;
  onDraftChange: (draft: SyntaxProfileDraft) => void;
};

const roleLabels = {
  multiline: "多行块",
  normal: "普通块",
};

const toneLabels: Record<CtnPresetSyntaxTone, string> = {
  amber: "琥珀",
  blue: "蓝色",
  cyan: "青色",
  code: "代码",
  gray: "灰色",
  green: "绿色",
  indigo: "靛蓝",
  pink: "粉色",
  red: "红色",
  teal: "青绿",
  violet: "紫色",
};

const defaultCustomTone = "#397c72";

type TonePickerProps = {
  value: CtnSyntaxTone;
  onChange: (tone: CtnSyntaxTone) => void;
};

function getToneLabel(tone: CtnSyntaxTone) {
  if (isCustomSyntaxTone(tone)) {
    return "自定义";
  }

  if (tone === "default") {
    return "默认";
  }

  return toneLabels[tone];
}

function getToneSwatchClass(tone: CtnSyntaxTone) {
  return isCustomSyntaxTone(tone)
    ? "syntax-tone-swatch syntax-tone-custom"
    : `syntax-tone-swatch syntax-tone-${tone}`;
}

function getToneSwatchStyle(tone: CtnSyntaxTone): CSSProperties | undefined {
  return isCustomSyntaxTone(tone)
    ? ({ "--syntax-tone-color": tone } as CSSProperties)
    : undefined;
}

function TonePicker({ value, onChange }: TonePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const isCustomTone = isCustomSyntaxTone(value);
  const customTone = isCustomTone ? value : defaultCustomTone;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (
        pickerRef.current &&
        event.target instanceof Node &&
        !pickerRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const selectTone = (tone: CtnSyntaxTone) => {
    onChange(tone);
    setIsOpen(false);
  };

  return (
    <div className="syntax-tone-picker" ref={pickerRef}>
      <button
        aria-controls={menuId}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="syntax-tone-button"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span
          aria-hidden="true"
          className={getToneSwatchClass(value)}
          style={getToneSwatchStyle(value)}
        >
          <span />
        </span>
        <span>{getToneLabel(value)}</span>
        <ChevronDown aria-hidden="true" size={13} strokeWidth={2} />
      </button>

      {isOpen ? (
        <div
          aria-label="颜色"
          className="syntax-tone-menu"
          id={menuId}
          role="dialog"
        >
          <div className="syntax-tone-grid" role="group" aria-label="预设颜色">
            {syntaxTones.map((tone) => (
              <button
                aria-label={toneLabels[tone]}
                className={
                  value === tone
                    ? "syntax-tone-tile is-selected"
                    : "syntax-tone-tile"
                }
                key={tone}
                onClick={() => selectTone(tone)}
                title={toneLabels[tone]}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className={getToneSwatchClass(tone)}
                >
                  <span />
                </span>
                {value === tone ? (
                  <Check aria-hidden="true" size={12} strokeWidth={2.4} />
                ) : null}
              </button>
            ))}
          </div>

          <div className="syntax-tone-custom-row">
            <button
              className={
                isCustomTone
                  ? "syntax-tone-custom-button is-selected"
                  : "syntax-tone-custom-button"
              }
              onClick={() => selectTone(customTone)}
              type="button"
            >
              <span
                aria-hidden="true"
                className="syntax-tone-swatch syntax-tone-custom"
                style={getToneSwatchStyle(customTone)}
              >
                <span />
              </span>
              自定义
            </button>
            <input
              aria-label="自定义颜色"
              type="color"
              value={customTone}
              onChange={(event) =>
                onChange(event.target.value as CtnSyntaxTone)
              }
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SyntaxWorkspacePanel({
  draft,
  onDraftChange,
}: SyntaxWorkspacePanelProps) {
  const updateDraftField = (
    field: keyof Pick<SyntaxProfileDraft, "name">,
    value: string,
  ) => {
    onDraftChange({
      ...draft,
      [field]: value,
    });
  };

  const updateMarkerRule = (
    ruleId: string,
    patch: Partial<SyntaxProfileDraftMarkerRule>,
  ) => {
    onDraftChange({
      ...draft,
      markerRules: draft.markerRules.map((rule) =>
        rule.id === ruleId ? { ...rule, ...patch } : rule,
      ),
    });
  };

  const updateConceptRule = (patch: Partial<SyntaxProfileDraftConceptRule>) => {
    onDraftChange({
      ...draft,
      conceptRule: {
        ...draft.conceptRule,
        ...patch,
      },
    });
  };

  const updateInlineRule = (
    ruleId: string,
    patch: Partial<SyntaxProfileDraftInlineRule>,
  ) => {
    onDraftChange({
      ...draft,
      inlineRules: draft.inlineRules.map((rule) =>
        rule.id === ruleId ? { ...rule, ...patch } : rule,
      ),
    });
  };

  const addMarkerRule = () => {
    onDraftChange({
      ...draft,
      markerRules: [
        ...draft.markerRules,
        createEmptyMarkerRuleDraft(Date.now()),
      ],
    });
  };

  const removeMarkerRule = (ruleId: string) => {
    onDraftChange({
      ...draft,
      markerRules: draft.markerRules.filter((rule) => rule.id !== ruleId),
    });
  };

  const addInlineRule = (kind: "paired" | "single") => {
    onDraftChange({
      ...draft,
      inlineRules: [
        ...draft.inlineRules,
        createEmptyInlineRuleDraft(Date.now(), kind),
      ],
    });
  };

  const removeInlineRule = (ruleId: string) => {
    onDraftChange({
      ...draft,
      inlineRules: draft.inlineRules.filter((rule) => rule.id !== ruleId),
    });
  };

  return (
    <section className="workspace-main-panel syntax-workspace-panel" aria-label="语法编辑">
      <header className="panel-header">
        <div>
          <h2>仓库语法配置</h2>
        </div>
        <div className="stats">
          <span>{draft.markerRules.length + 1} 行首</span>
          <span>{draft.inlineRules.length} 行内</span>
        </div>
      </header>

      <div className="syntax-form-scroll">
        <section className="syntax-form-section">
          <div className="syntax-form-section-header">
            <h3>基础信息</h3>
          </div>
          <div className="syntax-profile-grid">
            <label className="syntax-field">
              <span>名称</span>
              <input
                value={draft.name}
                onChange={(event) =>
                  updateDraftField("name", event.target.value)
                }
              />
            </label>
            <label className="syntax-field">
              <span>缩进单位</span>
              <input disabled value={draft.spaceIndentUnit} />
            </label>
          </div>
        </section>

        <section className="syntax-form-section">
          <div className="syntax-form-section-header">
            <h3>行首规则</h3>
            <button
              className="secondary-action-button"
              onClick={addMarkerRule}
              type="button"
            >
              <Plus aria-hidden="true" size={14} strokeWidth={2} />
              新增
            </button>
          </div>

          <div className="syntax-rule-column-header syntax-marker-rule-columns">
            <span>符号</span>
            <span>名称</span>
            <span>角色</span>
            <span>颜色</span>
            <span />
          </div>
          <div className="syntax-rule-list">
            <div className="syntax-marker-rule-row syntax-marker-rule-columns">
              <label className="syntax-field compact">
                <span>符号</span>
                <input disabled value="顶格" />
              </label>
              <label className="syntax-field">
                <span>名称</span>
                <input disabled value={draft.conceptRule.label} />
              </label>
              <label className="syntax-field compact">
                <span>角色</span>
                <select disabled value="normal">
                  <option value="normal">{roleLabels.normal}</option>
                </select>
              </label>
              <div className="syntax-field syntax-tone-field">
                <span>颜色</span>
                <TonePicker
                  value={draft.conceptRule.tone}
                  onChange={(tone) =>
                    updateConceptRule({
                      tone,
                    })
                  }
                />
              </div>
              <span
                aria-label="顶格概念是基础行首规则，不能删除"
                className="syntax-protected-rule-lock"
                title="基础行首规则，不能删除"
              />
            </div>
            {draft.markerRules.map((rule) => (
              <div
                className="syntax-marker-rule-row syntax-marker-rule-columns"
                key={rule.id}
              >
                <label className="syntax-field compact">
                  <span>符号</span>
                  <input
                    value={rule.marker}
                    onChange={(event) =>
                      updateMarkerRule(rule.id, { marker: event.target.value })
                    }
                  />
                </label>
                <label className="syntax-field">
                  <span>名称</span>
                  <input
                    value={rule.label}
                    onChange={(event) =>
                      updateMarkerRule(rule.id, { label: event.target.value })
                    }
                  />
                </label>
                <label className="syntax-field compact">
                  <span>角色</span>
                  <select
                    value={rule.role}
                    onChange={(event) =>
                      updateMarkerRule(rule.id, {
                        role: event.target.value as SyntaxProfileDraftMarkerRule["role"],
                      })
                    }
                  >
                    {syntaxRuleRoles.map((role) => (
                      <option key={role} value={role}>
                        {roleLabels[role]}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="syntax-field syntax-tone-field">
                  <span>颜色</span>
                  <TonePicker
                    value={rule.tone}
                    onChange={(tone) =>
                      updateMarkerRule(rule.id, {
                        tone,
                      })
                    }
                  />
                </div>
                <button
                  aria-label={`删除行首规则 ${rule.label || rule.marker || rule.id}`}
                  className="icon-action-button"
                  onClick={() => removeMarkerRule(rule.id)}
                  type="button"
                >
                  <Trash2 aria-hidden="true" size={14} strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="syntax-form-section">
          <div className="syntax-form-section-header">
            <h3>行内规则</h3>
            <div className="syntax-inline-actions">
              <button
                className="secondary-action-button"
                onClick={() => addInlineRule("paired")}
                type="button"
              >
                <Plus aria-hidden="true" size={14} strokeWidth={2} />
                成对
              </button>
              <button
                className="secondary-action-button"
                onClick={() => addInlineRule("single")}
                type="button"
              >
                <Plus aria-hidden="true" size={14} strokeWidth={2} />
                单符号
              </button>
            </div>
          </div>

          <div className="syntax-rule-column-header syntax-inline-rule-columns">
            <span>类型</span>
            <span>符号</span>
            <span>名称</span>
            <span>颜色</span>
            <span />
          </div>
          <div className="syntax-rule-list">
            {draft.inlineRules.map((rule) => {
              const isProtectedRule = isProtectedInlineRuleDraft(rule);

              return (
                <div
                  className="syntax-inline-rule-row syntax-inline-rule-columns"
                  key={rule.id}
                >
                    <label className="syntax-field compact">
                      <span>类型</span>
                      <select
                        disabled={isProtectedRule}
                        value={rule.kind}
                        onChange={(event) =>
                          updateInlineRule(rule.id, {
                            close: "",
                            kind: event.target.value as SyntaxProfileDraftInlineRule["kind"],
                            marker: "",
                            open: "",
                          })
                        }
                      >
                        <option value="paired">成对</option>
                        <option value="single">单符号</option>
                      </select>
                    </label>
                    <div className="syntax-field syntax-symbol-field">
                      <span>符号</span>
                      {rule.kind === "paired" ? (
                        <div className="syntax-symbol-inputs">
                          <input
                            aria-label="开始符号"
                            value={rule.open}
                            onChange={(event) =>
                              updateInlineRule(rule.id, { open: event.target.value })
                            }
                          />
                          <input
                            aria-label="结束符号"
                            value={rule.close}
                            onChange={(event) =>
                              updateInlineRule(rule.id, { close: event.target.value })
                            }
                          />
                        </div>
                      ) : (
                        <input
                          aria-label="行内符号"
                          value={rule.marker}
                          onChange={(event) =>
                            updateInlineRule(rule.id, { marker: event.target.value })
                          }
                        />
                      )}
                    </div>
                    <label className="syntax-field">
                      <span>名称</span>
                      <input
                        value={rule.label}
                        onChange={(event) =>
                          updateInlineRule(rule.id, { label: event.target.value })
                        }
                      />
                    </label>
                    <div className="syntax-field syntax-tone-field">
                      <span>颜色</span>
                      <TonePicker
                        value={rule.tone}
                        onChange={(tone) =>
                          updateInlineRule(rule.id, {
                            tone,
                          })
                        }
                      />
                    </div>
                    {isProtectedRule ? (
                      <span
                        aria-label="全局概念引用是可视化依赖规则，不能删除"
                        className="syntax-protected-rule-lock"
                        title="可视化依赖规则，不能删除"
                      />
                    ) : (
                      <button
                        aria-label={`删除行内规则 ${rule.label || rule.type || rule.id}`}
                        className="icon-action-button"
                        onClick={() => removeInlineRule(rule.id)}
                        type="button"
                      >
                        <Trash2 aria-hidden="true" size={14} strokeWidth={2} />
                      </button>
                    )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </section>
  );
}
