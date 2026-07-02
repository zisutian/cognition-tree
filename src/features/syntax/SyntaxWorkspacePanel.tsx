import { Save } from "lucide-react";
import type { WorkspaceSyntaxFile } from "../../storage/workspaceRepository";

type SyntaxWorkspacePanelProps = {
  draftSource: string;
  syntaxFile: WorkspaceSyntaxFile;
  onDraftSourceChange: (source: string) => void;
  onSaveSyntaxFile: () => void;
};

export function SyntaxWorkspacePanel({
  draftSource,
  syntaxFile,
  onDraftSourceChange,
  onSaveSyntaxFile,
}: SyntaxWorkspacePanelProps) {
  return (
    <section className="workspace-main-panel syntax-workspace-panel" aria-label="语法编辑">
      <header className="panel-header">
        <div>
          <h2>{syntaxFile.fileName}</h2>
        </div>
        <div className="stats">
          <span>{syntaxFile.profile.id}</span>
          <span>v{syntaxFile.profile.version}</span>
          <span>{syntaxFile.profile.markerRules.length} markers</span>
          <button
            className="primary-action-button"
            onClick={onSaveSyntaxFile}
            type="button"
          >
            <Save aria-hidden="true" size={14} strokeWidth={2} />
            保存
          </button>
        </div>
      </header>

      <textarea
        className="workspace-source-editor syntax-workspace-editor"
        spellCheck={false}
        value={draftSource}
        onChange={(event) => onDraftSourceChange(event.target.value)}
      />
    </section>
  );
}
