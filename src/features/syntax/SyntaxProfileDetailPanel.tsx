import type { WorkspaceSyntaxFile } from "../../storage/workspaceRepository";
import { parseSyntaxProfileToml } from "../../syntax/profileToml";

export type WorkspaceFeedback = {
  message: string;
  status: "error" | "success";
};

type SyntaxProfileDetailPanelProps = {
  draftSource: string;
  feedback: WorkspaceFeedback | null;
  syntaxFile: WorkspaceSyntaxFile;
};

export function SyntaxProfileDetailPanel({
  draftSource,
  feedback,
  syntaxFile,
}: SyntaxProfileDetailPanelProps) {
  const parsedDraft = parseSyntaxProfileToml(draftSource);
  const draftProfile = parsedDraft?.profile ?? null;
  const diagnostics = parsedDraft?.diagnostics ?? [];

  return (
    <aside className="workspace-detail-panel" aria-label="语法状态">
      <header className="panel-header">
        <div>
          <h2>语法</h2>
        </div>
        <div className="stats">
          <span>{syntaxFile.fileName}</span>
          <span>{diagnostics.length} 诊断</span>
        </div>
      </header>

      <div className="workspace-detail-body">
        {feedback ? (
          <section className={`workspace-status ${feedback.status}`}>
            <p>{feedback.message}</p>
          </section>
        ) : null}

        <section className="workspace-detail-section">
          <p className="workspace-detail-title">Profile</p>
          {draftProfile ? (
            <dl className="workspace-definition-list">
              <div>
                <dt>ID</dt>
                <dd>{draftProfile.id}</dd>
              </div>
              <div>
                <dt>Name</dt>
                <dd>{draftProfile.name}</dd>
              </div>
              <div>
                <dt>Version</dt>
                <dd>{draftProfile.version}</dd>
              </div>
              <div>
                <dt>Indent</dt>
                <dd>{draftProfile.spaceIndentUnit}</dd>
              </div>
            </dl>
          ) : (
            <p className="workspace-muted">无有效 profile</p>
          )}
        </section>

        <section className="workspace-detail-section">
          <p className="workspace-detail-title">Markers</p>
          {draftProfile ? (
            <div className="workspace-marker-list">
              {draftProfile.markerRules.map((rule) => (
                <div className="workspace-marker-entry" key={rule.marker}>
                  <code>{rule.marker}</code>
                  <span>{rule.label}</span>
                  <small>
                    {rule.type} / {rule.role} / {rule.tone}
                  </small>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="workspace-detail-section">
          <p className="workspace-detail-title">Inline Rules</p>
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
                  <span>{rule.label}</span>
                  <small>
                    {rule.type} / {rule.kind} / {rule.tone}
                  </small>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {diagnostics.length > 0 ? (
          <section className="workspace-detail-section">
            <p className="workspace-detail-title">Diagnostics</p>
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
