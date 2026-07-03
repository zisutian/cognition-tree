import type { CtnSyntaxTone } from "../../ctn-syntax/types";
import { getToneSwatchClass, getToneSwatchStyle } from "./TonePicker";
import type { SyntaxProfileDraftBuildResult } from "../../ctn-syntax/profileDraft";

type SyntaxProfileFeedback = {
  message: string;
  status: "error" | "success";
};

type SyntaxProfileDetailPanelProps = {
  draftResult: SyntaxProfileDraftBuildResult;
  feedback: SyntaxProfileFeedback | null;
};

function ToneSwatch({
  label,
  tone,
}: {
  label: string;
  tone: CtnSyntaxTone;
}) {
  return (
    <span
      aria-label={`${label} ${tone}`}
      className={getToneSwatchClass(tone)}
      style={getToneSwatchStyle(tone)}
      title={`${label} ${tone}`}
    >
      <span />
    </span>
  );
}

export function SyntaxProfileDetailPanel({
  draftResult,
  feedback,
}: SyntaxProfileDetailPanelProps) {
  const draftProfile = draftResult.profile;
  const diagnostics = draftResult.diagnostics;

  return (
    <aside className="workspace-detail-panel" aria-label="语法状态">
      <header className="panel-header">
        <div>
          <h2>语法</h2>
        </div>
        <div className="stats">
          <span>{diagnostics.length} 校验</span>
        </div>
      </header>

      <div className="workspace-detail-body">
        {feedback ? (
          <section className={`workspace-status ${feedback.status}`}>
            <p>{feedback.message}</p>
          </section>
        ) : null}

        <section className="workspace-detail-section">
          <p className="workspace-detail-title">生成摘要</p>
          {draftProfile ? (
            <dl className="workspace-definition-list">
              <div>
                <dt>名称</dt>
                <dd>{draftProfile.name}</dd>
              </div>
              <div>
                <dt>Tab</dt>
                <dd>{draftProfile.tabDisplayWidth}</dd>
              </div>
              <div>
                <dt>行首</dt>
                <dd>{draftProfile.markerRules.length + 1}</dd>
              </div>
              <div>
                <dt>行内</dt>
                <dd>{draftProfile.inlineRules.length}</dd>
              </div>
            </dl>
          ) : (
            <p className="workspace-muted">无有效 profile</p>
          )}
        </section>

        <section className="workspace-detail-section">
          <p className="workspace-detail-title">行首规则</p>
          {draftProfile ? (
            <div className="workspace-marker-list">
              <div className="workspace-marker-entry">
                <code>顶格</code>
                <ToneSwatch label="背景" tone={draftProfile.conceptRule.tone} />
                <ToneSwatch
                  label="字体"
                  tone={draftProfile.conceptRule.textColor}
                />
                <span className="workspace-marker-label">
                  {draftProfile.conceptRule.label}
                </span>
              </div>
              {draftProfile.markerRules.map((rule) => (
                <div className="workspace-marker-entry" key={rule.marker}>
                  <code>{rule.marker}</code>
                  <ToneSwatch label="背景" tone={rule.tone} />
                  <ToneSwatch label="字体" tone={rule.textColor} />
                  <span className="workspace-marker-label">{rule.label}</span>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="workspace-detail-section">
          <p className="workspace-detail-title">行内规则</p>
          {draftProfile ? (
            <div className="workspace-marker-list">
              {draftProfile.inlineRules.map((rule) => (
                <div
                  className="workspace-marker-entry"
                  key={
                    rule.kind === "paired"
                      ? `${rule.kind}-${rule.open}-${rule.close}`
                      : `${rule.kind}-${rule.marker}`
                  }
                >
                  <code>
                    {rule.kind === "paired"
                      ? `${rule.open}…${rule.close}`
                      : rule.marker}
                  </code>
                  <ToneSwatch label="背景" tone={rule.tone} />
                  <ToneSwatch label="字体" tone={rule.textColor} />
                  <span className="workspace-marker-label">{rule.label}</span>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {diagnostics.length > 0 ? (
          <section className="workspace-detail-section">
            <p className="workspace-detail-title">校验问题</p>
            <ul className="workspace-diagnostic-list">
              {diagnostics.map((diagnostic, index) => (
                <li key={`${diagnostic.path}-${index}`}>
                  <span>{diagnostic.path}</span>
                  <p>{diagnostic.message}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </aside>
  );
}
