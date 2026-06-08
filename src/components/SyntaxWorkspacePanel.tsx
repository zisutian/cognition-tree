import { Save } from "lucide-react";
import type { SyntaxProfileFile } from "../storage/noteRepository";

type SyntaxWorkspacePanelProps = {
  draftSource: string;
  selectedFile: SyntaxProfileFile | null;
  onDraftSourceChange: (source: string) => void;
  onSaveSyntaxFile: () => void;
};

export function SyntaxWorkspacePanel({
  draftSource,
  selectedFile,
  onDraftSourceChange,
  onSaveSyntaxFile,
}: SyntaxWorkspacePanelProps) {
  return (
    <section className="workspace-main-panel syntax-workspace-panel" aria-label="语法编辑">
      <header className="panel-header">
        <div>
          <p className="eyebrow">Syntax TOML</p>
          <h2>{selectedFile?.fileName ?? "语法文件"}</h2>
        </div>
        <div className="stats">
          {selectedFile ? (
            <>
              <span>{selectedFile.profile.id}</span>
              <span>v{selectedFile.profile.version}</span>
              <span>{selectedFile.profile.markerRules.length} markers</span>
            </>
          ) : (
            <span>未选择</span>
          )}
          <button
            className="primary-action-button"
            disabled={!selectedFile}
            onClick={onSaveSyntaxFile}
            type="button"
          >
            <Save aria-hidden="true" size={14} strokeWidth={2} />
            保存
          </button>
        </div>
      </header>

      {selectedFile ? (
        <textarea
          className="workspace-source-editor syntax-workspace-editor"
          spellCheck={false}
          value={draftSource}
          onChange={(event) => onDraftSourceChange(event.target.value)}
        />
      ) : (
        <div className="workspace-empty-state">
          <h3>没有语法文件</h3>
        </div>
      )}
    </section>
  );
}
