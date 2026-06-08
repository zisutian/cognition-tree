import { FilePlus, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { SyntaxProfileFile } from "../../storage/noteRepository";

type SidebarSyntaxPanelProps = {
  syntaxFiles: SyntaxProfileFile[];
  onCreateSyntaxFile: (fileName: string) => void;
  onDeleteSyntaxFile: (fileName: string) => void;
  onUpdateSyntaxFile: (fileName: string, source: string) => void;
};

export function SidebarSyntaxPanel({
  syntaxFiles,
  onCreateSyntaxFile,
  onDeleteSyntaxFile,
  onUpdateSyntaxFile,
}: SidebarSyntaxPanelProps) {
  const [selectedFileName, setSelectedFileName] = useState("");
  const [draftSource, setDraftSource] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const selectedFile = useMemo(
    () =>
      syntaxFiles.find((file) => file.fileName === selectedFileName) ??
      syntaxFiles[0] ??
      null,
    [selectedFileName, syntaxFiles],
  );

  useEffect(() => {
    if (!selectedFile) {
      setSelectedFileName("");
      setDraftSource("");
      return;
    }

    setSelectedFileName(selectedFile.fileName);
    setDraftSource(selectedFile.source);
  }, [selectedFile]);

  const requestCreateSyntaxFile = () => {
    const fileName = window.prompt("语法文件名", "ctn-custom.toml");

    if (!fileName) {
      return;
    }

    setErrorMessage("");
    void Promise.resolve(onCreateSyntaxFile(fileName)).catch((error: unknown) => {
      setErrorMessage(error instanceof Error ? error.message : "语法文件创建失败。");
    });
  };

  const saveSelectedSyntaxFile = () => {
    if (!selectedFile) {
      return;
    }

    setErrorMessage("");
    void Promise.resolve(
      onUpdateSyntaxFile(selectedFile.fileName, draftSource),
    ).catch((error: unknown) => {
      setErrorMessage(error instanceof Error ? error.message : "语法文件保存失败。");
    });
  };

  const deleteSelectedSyntaxFile = () => {
    if (!selectedFile || !window.confirm(`删除语法文件「${selectedFile.fileName}」？`)) {
      return;
    }

    setErrorMessage("");
    void Promise.resolve(onDeleteSyntaxFile(selectedFile.fileName)).catch(
      (error: unknown) => {
        setErrorMessage(
          error instanceof Error ? error.message : "语法文件删除失败。",
        );
      },
    );
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
                file.fileName === selectedFile?.fileName
                  ? "syntax-file-entry active"
                  : "syntax-file-entry"
              }
              key={file.fileName}
              onClick={() => setSelectedFileName(file.fileName)}
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

      <section className="side-section syntax-editor-section">
        <div className="side-section-header">
          <p className="side-section-title">{selectedFile?.fileName ?? "TOML"}</p>
          <div className="side-action-group">
            <button
              className="side-action-button"
              disabled={!selectedFile}
              onClick={saveSelectedSyntaxFile}
              type="button"
            >
              <Save aria-hidden="true" size={13} strokeWidth={2} />
              保存
            </button>
            <button
              className="side-action-button"
              disabled={!selectedFile}
              onClick={deleteSelectedSyntaxFile}
              type="button"
            >
              <Trash2 aria-hidden="true" size={13} strokeWidth={2} />
              删除
            </button>
          </div>
        </div>
        <textarea
          className="syntax-source-editor"
          disabled={!selectedFile}
          spellCheck={false}
          value={draftSource}
          onChange={(event) => setDraftSource(event.target.value)}
        />
        {errorMessage ? <p className="side-error">{errorMessage}</p> : null}
      </section>
    </div>
  );
}
