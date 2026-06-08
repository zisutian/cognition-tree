import { FilePlus, Trash2 } from "lucide-react";
import type { SyntaxProfileFile } from "../../storage/noteRepository";

type SidebarSyntaxPanelProps = {
  selectedFileName: string;
  syntaxFiles: SyntaxProfileFile[];
  onCreateSyntaxFile: (fileName: string) => void;
  onDeleteSyntaxFile: (fileName: string) => void;
  onSelectSyntaxFile: (fileName: string) => void;
};

export function SidebarSyntaxPanel({
  selectedFileName,
  syntaxFiles,
  onCreateSyntaxFile,
  onDeleteSyntaxFile,
  onSelectSyntaxFile,
}: SidebarSyntaxPanelProps) {
  const requestCreateSyntaxFile = () => {
    const fileName = window.prompt("语法文件名", "ctn-custom.toml");

    if (!fileName) {
      return;
    }

    onCreateSyntaxFile(fileName);
  };

  const requestDeleteSyntaxFile = () => {
    if (
      !selectedFileName ||
      !window.confirm(`删除语法文件「${selectedFileName}」？`)
    ) {
      return;
    }

    onDeleteSyntaxFile(selectedFileName);
  };

  return (
    <div className="side-panel-body">
      <section className="side-section">
        <div className="side-section-header">
          <p className="side-section-title">语法文件</p>
          <button
            className="side-action-button"
            onClick={requestCreateSyntaxFile}
            type="button"
          >
            <FilePlus aria-hidden="true" size={13} strokeWidth={2} />
            新建
          </button>
        </div>
        <div className="syntax-file-list">
          {syntaxFiles.map((file) => (
            <button
              className={
                file.fileName === selectedFileName
                  ? "syntax-file-entry active"
                  : "syntax-file-entry"
              }
              key={file.fileName}
              onClick={() => onSelectSyntaxFile(file.fileName)}
              type="button"
            >
              <span>{file.profile.name}</span>
              <code>
                {file.profile.id}@{file.profile.version}
              </code>
            </button>
          ))}
        </div>
      </section>

      <section className="side-section">
        <button
          className="side-action-button syntax-delete-button"
          disabled={!selectedFileName}
          onClick={requestDeleteSyntaxFile}
          type="button"
        >
          <Trash2 aria-hidden="true" size={13} strokeWidth={2} />
          删除当前语法
        </button>
      </section>
    </div>
  );
}
