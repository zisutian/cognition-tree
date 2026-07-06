import { Plus, Trash2 } from "lucide-react";
import type {
  UiSyntaxProfileDraftConceptRule,
  UiSyntaxProfileDraftInlineRule,
  UiSyntaxProfileDraftMarkerRule,
  UiSyntaxProfileDraftTitleRule,
  UiSyntaxRole,
  UiSyntaxView,
} from "../../../application/workspace/projection/viewSyntax";
import {
  UiButton,
  UiField,
  UiFormSection,
  UiPanel,
  UiPanelHeader,
} from "../../shared/primitives";
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
      updateTitleRule: (
        patch: Partial<UiSyntaxProfileDraftTitleRule>,
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
    <UiPanel className="syntax-main-panel" aria-label="语法编辑" variant="main">
      <UiPanelHeader title="仓库语法配置" />

      <div className="syntax-form-scroll">
        <UiFormSection title="基础信息">
          <div className="syntax-profile-grid">
            <UiField label="名称">
              <input
                value={draft.name}
                onChange={(event) =>
                  actions.updateDraftField("name", event.target.value)
                }
              />
            </UiField>
            <UiField label="缩进宽度">
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
            </UiField>
          </div>
        </UiFormSection>

        <UiFormSection
          actions={
            <UiButton
              onClick={actions.addMarkerRule}
              type="button"
              variant="secondary"
            >
              <Plus aria-hidden="true" size={14} strokeWidth={2} />
              新增
            </UiButton>
          }
          title="块规则"
        >

          <div className="syntax-rule-column-header syntax-marker-rule-columns">
            <span>符号</span>
            <span>名称</span>
            <span>角色</span>
            <span>背景色</span>
            <span>文字色</span>
            <span />
          </div>
          <div className="syntax-rule-list">
            <div className="ui-form-row syntax-marker-rule-columns">
              <UiField hiddenLabel label="符号">
                <input disabled value="首行标题" />
              </UiField>
              <UiField hiddenLabel label="名称">
                <input disabled value={draft.titleRule.label} />
              </UiField>
              <UiField hiddenLabel label="角色">
                <select disabled value="normal">
                  {roleOptions.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </UiField>
              <UiField as="div" hiddenLabel label="背景色">
                <TonePicker
                  ariaLabel="首行标题背景色"
                  options={toneOptions}
                  value={draft.titleRule.tone}
                  onChange={(tone) => actions.updateTitleRule({ tone })}
                />
              </UiField>
              <UiField as="div" hiddenLabel label="文字色">
                <TonePicker
                  ariaLabel="首行标题文字色"
                  options={toneOptions}
                  value={draft.titleRule.textColor}
                  onChange={(textColor) =>
                    actions.updateTitleRule({ textColor })
                  }
                />
              </UiField>
              <span
                aria-label="首行标题是固定块规则，不能删除"
                className="syntax-protected-rule-lock"
                title="固定块规则，不能删除"
              />
            </div>
            <div className="ui-form-row syntax-marker-rule-columns">
              <UiField hiddenLabel label="符号">
                <input disabled value="顶格概念" />
              </UiField>
              <UiField hiddenLabel label="名称">
                <input disabled value={draft.conceptRule.label} />
              </UiField>
              <UiField hiddenLabel label="角色">
                <select disabled value="normal">
                  {roleOptions.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </UiField>
              <UiField as="div" hiddenLabel label="背景色">
                <TonePicker
                  ariaLabel="顶格概念背景色"
                  options={toneOptions}
                  value={draft.conceptRule.tone}
                  onChange={(tone) => actions.updateConceptRule({ tone })}
                />
              </UiField>
              <UiField as="div" hiddenLabel label="文字色">
                <TonePicker
                  ariaLabel="顶格概念文字色"
                  options={toneOptions}
                  value={draft.conceptRule.textColor}
                  onChange={(textColor) =>
                    actions.updateConceptRule({ textColor })
                  }
                />
              </UiField>
              <span
                aria-label="顶格概念是基础块规则，不能删除"
                className="syntax-protected-rule-lock"
                title="基础块规则，不能删除"
              />
            </div>
            {draft.markerRules.map((rule) => (
              <div
                className="ui-form-row syntax-marker-rule-columns"
                key={rule.id}
              >
                <UiField hiddenLabel label="符号">
                  <input
                    value={rule.marker}
                    onChange={(event) =>
                      actions.updateMarkerRule(rule.id, {
                        marker: event.target.value,
                      })
                    }
                  />
                </UiField>
                <UiField hiddenLabel label="名称">
                  <input
                    value={rule.label}
                    onChange={(event) =>
                      actions.updateMarkerRule(rule.id, {
                        label: event.target.value,
                      })
                    }
                  />
                </UiField>
                <UiField hiddenLabel label="角色">
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
                </UiField>
                <UiField as="div" hiddenLabel label="背景色">
                  <TonePicker
                    ariaLabel={`${rule.label || rule.marker || rule.id} 背景色`}
                    options={toneOptions}
                    value={rule.tone}
                    onChange={(tone) =>
                      actions.updateMarkerRule(rule.id, { tone })
                    }
                  />
                </UiField>
                <UiField as="div" hiddenLabel label="文字色">
                  <TonePicker
                    ariaLabel={`${rule.label || rule.marker || rule.id} 文字色`}
                    options={toneOptions}
                    value={rule.textColor}
                    onChange={(textColor) =>
                      actions.updateMarkerRule(rule.id, { textColor })
                    }
                  />
                </UiField>
                <UiButton
                  aria-label={`删除块规则 ${rule.label || rule.marker || rule.id}`}
                  className="syntax-rule-action"
                  onClick={() => actions.removeMarkerRule(rule.id)}
                  type="button"
                  variant="icon"
                >
                  <Trash2 aria-hidden="true" size={14} strokeWidth={2} />
                </UiButton>
              </div>
            ))}
          </div>
        </UiFormSection>

        <UiFormSection
          actions={
            <UiButton
              onClick={() => actions.addInlineRule("paired")}
              type="button"
              variant="secondary"
            >
              <Plus aria-hidden="true" size={14} strokeWidth={2} />
              新增
            </UiButton>
          }
          title="行内规则"
        >
          <div className="syntax-rule-column-header syntax-inline-rule-columns">
            <span>类型</span>
            <span>符号</span>
            <span>名称</span>
            <span>背景色</span>
            <span>文字色</span>
            <span />
          </div>
          <div className="syntax-rule-list">
            {draft.inlineRules.map((rule) => {
              const isProtectedRule = protectedInlineRuleIdSet.has(rule.id);

              return (
                <div className="ui-form-row syntax-inline-rule-columns" key={rule.id}>
                  <UiField hiddenLabel label="类型">
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
                      <option value="paired">成对符号</option>
                      <option value="single">单个符号</option>
                    </select>
                  </UiField>
                  <UiField as="div" hiddenLabel label="符号">
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
                  </UiField>
                  <UiField hiddenLabel label="名称">
                    <input
                      value={rule.label}
                      onChange={(event) =>
                        actions.updateInlineRule(rule.id, {
                          label: event.target.value,
                        })
                      }
                    />
                  </UiField>
                  <UiField as="div" hiddenLabel label="背景色">
                    <TonePicker
                      ariaLabel={`${rule.label || rule.type || rule.id} 背景色`}
                      options={toneOptions}
                      value={rule.tone}
                      onChange={(tone) =>
                        actions.updateInlineRule(rule.id, { tone })
                      }
                    />
                  </UiField>
                  <UiField as="div" hiddenLabel label="文字色">
                    <TonePicker
                      ariaLabel={`${rule.label || rule.type || rule.id} 文字色`}
                      options={toneOptions}
                      value={rule.textColor}
                      onChange={(textColor) =>
                        actions.updateInlineRule(rule.id, { textColor })
                      }
                    />
                  </UiField>
                  {isProtectedRule ? (
                    <span
                      aria-label="全局概念引用是可视化依赖规则，不能删除"
                      className="syntax-protected-rule-lock"
                      title="可视化依赖规则，不能删除"
                    />
                  ) : (
                    <UiButton
                      aria-label={`删除行内规则 ${rule.label || rule.type || rule.id}`}
                      className="syntax-rule-action"
                      onClick={() => actions.removeInlineRule(rule.id)}
                      type="button"
                      variant="icon"
                    >
                      <Trash2 aria-hidden="true" size={14} strokeWidth={2} />
                    </UiButton>
                  )}
                </div>
              );
            })}
          </div>
        </UiFormSection>
      </div>
    </UiPanel>
  );
}
