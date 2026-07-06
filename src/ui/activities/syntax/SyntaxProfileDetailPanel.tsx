import { getToneSwatchClass, getToneSwatchStyle } from "./TonePicker";
import type {
  UiSyntaxProfileDraftBuildResult,
  UiSyntaxTone,
} from "../../../application/workspace/projection/viewSyntax";

type SyntaxProfileFeedback = {
  message: string;
  status: "error" | "success";
};

type SyntaxProfileDetailPanelProps = {
  draftResult: UiSyntaxProfileDraftBuildResult;
  feedback: SyntaxProfileFeedback | null;
};

function ToneSwatch({
  label,
  tone,
}: {
  label: string;
  tone: UiSyntaxTone;
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
    <aside className="activity-detail-panel" aria-label="语法状态">
      <header className="panel-header">
        <div>
          <h2>语法</h2>
        </div>
        <div className="stats">
          <span>{diagnostics.length} 校验</span>
        </div>
      </header>

      <div className="activity-detail-body">
        {feedback ? (
          <section className={`activity-status ${feedback.status}`}>
            <p>{feedback.message}</p>
          </section>
        ) : null}

        <section className="activity-detail-section">
          <p className="activity-detail-title">生成摘要</p>
          {draftProfile ? (
            <dl className="activity-definition-list">
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
            <p className="activity-muted">无有效 profile</p>
          )}
        </section>

        <section className="activity-detail-section">
          <p className="activity-detail-title">行首规则</p>
          {draftProfile ? (
            <div className="activity-marker-list">
              <div className="activity-marker-entry">
                <code>顶格</code>
                <ToneSwatch label="背景" tone={draftProfile.conceptRule.tone} />
                <ToneSwatch
                  label="字体"
                  tone={draftProfile.conceptRule.textColor}
                />
                <span className="activity-marker-label">
                  {draftProfile.conceptRule.label}
                </span>
              </div>
              {draftProfile.markerRules.map((rule) => (
                <div className="activity-marker-entry" key={rule.marker}>
                  <code>{rule.marker}</code>
                  <ToneSwatch label="背景" tone={rule.tone} />
                  <ToneSwatch label="字体" tone={rule.textColor} />
                  <span className="activity-marker-label">{rule.label}</span>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="activity-detail-section">
          <p className="activity-detail-title">行内规则</p>
          {draftProfile ? (
            <div className="activity-marker-list">
              {draftProfile.inlineRules.map((rule) => (
                <div
                  className="activity-marker-entry"
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
                  <span className="activity-marker-label">{rule.label}</span>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {diagnostics.length > 0 ? (
          <section className="activity-detail-section">
            <p className="activity-detail-title">校验问题</p>
            <ul className="activity-diagnostic-list">
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
