import type { WorkspaceSyntaxFile } from "../../storage/workspaceRepository";

type SidebarSyntaxPanelProps = {
  syntaxFile: WorkspaceSyntaxFile;
};

export function SidebarSyntaxPanel({
  syntaxFile,
}: SidebarSyntaxPanelProps) {
  return (
    <div className="side-panel-body">
      <section className="side-section">
        <p className="side-section-title">仓库语法</p>
        <div className="syntax-file-list">
          <div className="syntax-file-entry active">
            <span>{syntaxFile.profile.name}</span>
            <code>
              {syntaxFile.profile.id}@{syntaxFile.profile.version}
            </code>
          </div>
        </div>
      </section>

      <section className="side-section">
        <p className="side-section-title">规则数量</p>
        <div className="side-metrics">
          <div className="side-metric">
            <span>行首</span>
            <strong>{syntaxFile.profile.markerRules.length}</strong>
          </div>
          <div className="side-metric">
            <span>行内</span>
            <strong>{syntaxFile.profile.inlineRules.length}</strong>
          </div>
        </div>
      </section>
    </div>
  );
}
