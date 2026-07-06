import { Plus, Trash2 } from "lucide-react";
import type {
  UiSyntaxProfileDraftConceptRule,
  UiSyntaxProfileDraftInlineRule,
  UiSyntaxProfileDraftMarkerRule,
  UiSyntaxRole,
  UiSyntaxView,
} from "../../../application/workspace/viewTypes";
import { TonePicker } from "./TonePicker";

type SyntaxMainPanelProps = {
  view: UiSyntaxView & {
    actions: {
      addInlineRule: (kind: "paired" | "single") => void;
      addMarkerRule: () => void;
      removeInlineRule: (ruleId: string) => void;
      removeMarkerRule: (ruleId: string) => void;
      updateConceptRule: (
        patch: Partial<UiSyntaxProfileDraftConceptRule>,
      ) => void;
      updateDraftField: (
        field: "name" | "tabDisplayWidth",
        value: string,
      ) => void;
      updateInlineRule: (
        ruleId: string,
        patch: Partial<UiSyntaxProfileDraftInlineRule>,
      ) => void;
      updateMarkerRule: (
        ruleId: string,
        patch: Partial<UiSyntaxProfileDraftMarkerRule>,
      ) => void;
    };
    protectedInlineRuleIds: string[];
  };
};

export function SyntaxMainPanel({ view }: SyntaxMainPanelProps) {
  const { actions, draft, protectedInlineRuleIds, roleOptions, toneOptions } =
    view;
  const protectedInlineRuleIdSet = new Set(protectedInlineRuleIds);

  return (
    <section className="activity-main-panel syntax-main-panel" aria-label="语法编辑">
      <header className="panel-header">
        <div>
          <h2>仓库语法配置</h2>
        </div>
        <div className="stats">
          <span>{view.stats.markerRuleCount} 行首</span>
          <span>{view.stats.inlineRuleCount} 行内</span>
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
                  actions.updateDraftField("name", event.target.value)
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
                  actions.updateDraftField("tabDisplayWidth", event.target.value)
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
              onClick={actions.addMarkerRule}
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
                  {roleOptions.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="syntax-field syntax-tone-field">
                <span>背景</span>
                <TonePicker
                  ariaLabel="顶格概念背景色"
                  options={toneOptions}
                  value={draft.conceptRule.tone}
                  onChange={(tone) => actions.updateConceptRule({ tone })}
                />
              </div>
              <div className="syntax-field syntax-tone-field">
                <span>字体</span>
                <TonePicker
                  ariaLabel="顶格概念字体色"
                  options={toneOptions}
                  value={draft.conceptRule.textColor}
                  onChange={(textColor) =>
                    actions.updateConceptRule({ textColor })
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
                      actions.updateMarkerRule(rule.id, {
                        marker: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="syntax-field">
                  <span>名称</span>
                  <input
                    value={rule.label}
                    onChange={(event) =>
                      actions.updateMarkerRule(rule.id, {
                        label: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="syntax-field compact">
                  <span>角色</span>
                  <select
                    value={rule.role}
                    onChange={(event) =>
                      actions.updateMarkerRule(rule.id, {
                        role: event.target.value as UiSyntaxRole,
                      })
                    }
                  >
                    {roleOptions.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="syntax-field syntax-tone-field">
                  <span>背景</span>
                  <TonePicker
                    ariaLabel={`${rule.label || rule.marker || rule.id} 背景色`}
                    options={toneOptions}
                    value={rule.tone}
                    onChange={(tone) =>
                      actions.updateMarkerRule(rule.id, { tone })
                    }
                  />
                </div>
                <div className="syntax-field syntax-tone-field">
                  <span>字体</span>
                  <TonePicker
                    ariaLabel={`${rule.label || rule.marker || rule.id} 字体色`}
                    options={toneOptions}
                    value={rule.textColor}
                    onChange={(textColor) =>
                      actions.updateMarkerRule(rule.id, { textColor })
                    }
                  />
                </div>
                <button
                  aria-label={`删除行首规则 ${rule.label || rule.marker || rule.id}`}
                  className="icon-action-button"
                  onClick={() => actions.removeMarkerRule(rule.id)}
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
                onClick={() => actions.addInlineRule("paired")}
                type="button"
              >
                <Plus aria-hidden="true" size={14} strokeWidth={2} />
                成对
              </button>
              <button
                className="secondary-action-button"
                onClick={() => actions.addInlineRule("single")}
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
              const isProtectedRule = protectedInlineRuleIdSet.has(rule.id);

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
                        actions.updateInlineRule(rule.id, {
                          close: "",
                          kind: event.target.value as UiSyntaxProfileDraftInlineRule["kind"],
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
                            actions.updateInlineRule(rule.id, {
                              open: event.target.value,
                            })
                          }
                        />
                        <input
                          aria-label="结束符号"
                          value={rule.close}
                          onChange={(event) =>
                            actions.updateInlineRule(rule.id, {
                              close: event.target.value,
                            })
                          }
                        />
                      </div>
                    ) : (
                      <input
                        aria-label="行内符号"
                        value={rule.marker}
                        onChange={(event) =>
                          actions.updateInlineRule(rule.id, {
                            marker: event.target.value,
                          })
                        }
                      />
                    )}
                  </div>
                  <label className="syntax-field">
                    <span>名称</span>
                    <input
                      value={rule.label}
                      onChange={(event) =>
                        actions.updateInlineRule(rule.id, {
                          label: event.target.value,
                        })
                      }
                    />
                  </label>
                  <div className="syntax-field syntax-tone-field">
                    <span>背景</span>
                    <TonePicker
                      ariaLabel={`${rule.label || rule.type || rule.id} 背景色`}
                      options={toneOptions}
                      value={rule.tone}
                      onChange={(tone) =>
                        actions.updateInlineRule(rule.id, { tone })
                      }
                    />
                  </div>
                  <div className="syntax-field syntax-tone-field">
                    <span>字体</span>
                    <TonePicker
                      ariaLabel={`${rule.label || rule.type || rule.id} 字体色`}
                      options={toneOptions}
                      value={rule.textColor}
                      onChange={(textColor) =>
                        actions.updateInlineRule(rule.id, { textColor })
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
                      onClick={() => actions.removeInlineRule(rule.id)}
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
