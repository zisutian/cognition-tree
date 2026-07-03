import { Plus, Trash2 } from "lucide-react";
import { TonePicker } from "./TonePicker";
import {
  createEmptyInlineRuleDraft,
  createEmptyMarkerRuleDraft,
  isProtectedInlineRuleDraft,
  type SyntaxProfileDraft,
  type SyntaxProfileDraftConceptRule,
  type SyntaxProfileDraftInlineRule,
  type SyntaxProfileDraftMarkerRule,
  syntaxRuleRoles,
} from "../../ctn-syntax/profileDraft";

type SyntaxWorkspacePanelProps = {
  draft: SyntaxProfileDraft;
  onDraftChange: (draft: SyntaxProfileDraft) => void;
};

const roleLabels = {
  multiline: "多行块",
  normal: "普通块",
};

export function SyntaxWorkspacePanel({
  draft,
  onDraftChange,
}: SyntaxWorkspacePanelProps) {
  const updateDraftField = (
    field: keyof Pick<SyntaxProfileDraft, "name" | "tabDisplayWidth">,
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
              <span>Tab 宽度</span>
              <input
                inputMode="numeric"
                min="1"
                step="1"
                type="number"
                value={draft.tabDisplayWidth}
                onChange={(event) =>
                  updateDraftField("tabDisplayWidth", event.target.value)
                }
              />
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
            <span>背景</span>
            <span>字体</span>
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
                <span>背景</span>
                <TonePicker
                  ariaLabel="顶格概念背景色"
                  value={draft.conceptRule.tone}
                  onChange={(tone) =>
                    updateConceptRule({
                      tone,
                    })
                  }
                />
              </div>
              <div className="syntax-field syntax-tone-field">
                <span>字体</span>
                <TonePicker
                  ariaLabel="顶格概念字体色"
                  value={draft.conceptRule.textColor}
                  onChange={(textColor) =>
                    updateConceptRule({
                      textColor,
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
                  <span>背景</span>
                  <TonePicker
                    ariaLabel={`${rule.label || rule.marker || rule.id} 背景色`}
                    value={rule.tone}
                    onChange={(tone) =>
                      updateMarkerRule(rule.id, {
                        tone,
                      })
                    }
                  />
                </div>
                <div className="syntax-field syntax-tone-field">
                  <span>字体</span>
                  <TonePicker
                    ariaLabel={`${rule.label || rule.marker || rule.id} 字体色`}
                    value={rule.textColor}
                    onChange={(textColor) =>
                      updateMarkerRule(rule.id, {
                        textColor,
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
            <span>背景</span>
            <span>字体</span>
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
                      <span>背景</span>
                      <TonePicker
                        ariaLabel={`${rule.label || rule.type || rule.id} 背景色`}
                        value={rule.tone}
                        onChange={(tone) =>
                          updateInlineRule(rule.id, {
                            tone,
                          })
                        }
                      />
                    </div>
                    <div className="syntax-field syntax-tone-field">
                      <span>字体</span>
                      <TonePicker
                        ariaLabel={`${rule.label || rule.type || rule.id} 字体色`}
                        value={rule.textColor}
                        onChange={(textColor) =>
                          updateInlineRule(rule.id, {
                            textColor,
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
