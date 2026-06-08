import { CtnEditor, type CtnEditorFocusTarget } from "../editor/CtnEditor";
import type { CtnDocument, CtnSyntaxProfile } from "../ctn/parseOutline";

function syntaxProfileOptionValue(profile: CtnSyntaxProfile) {
  return JSON.stringify([profile.id, profile.version]);
}

export function NoteEditorPanel({
  documentText,
  focusTarget,
  hasActiveNote,
  parsedDocument,
  syntaxProfile,
  syntaxIssueMessage,
  syntaxProfiles,
  title,
  onCreateNote,
  onDocumentTextChange,
  onSyntaxProfileChange,
}: {
  documentText: string;
  focusTarget: CtnEditorFocusTarget | null;
  hasActiveNote: boolean;
  parsedDocument: CtnDocument;
  syntaxProfile: CtnSyntaxProfile | null;
  syntaxIssueMessage: string | null;
  syntaxProfiles: CtnSyntaxProfile[];
  title: string;
  onCreateNote: () => void;
  onDocumentTextChange: (source: string) => void;
  onSyntaxProfileChange: (syntaxProfileId: string, syntaxVersion: number) => void;
}) {
  const lineCount = documentText.split("\n").length;
  const totalBlocks = parsedDocument.blocks.length;
  const outline = parsedDocument.roots;
  const selectedSyntaxProfileValue = syntaxProfile
    ? syntaxProfileOptionValue(syntaxProfile)
    : "";
  const changeSyntaxProfile = (value: string) => {
    const [syntaxProfileId, syntaxVersion] = JSON.parse(value) as [
      string,
      number,
    ];

    onSyntaxProfileChange(syntaxProfileId, syntaxVersion);
  };

  return (
    <section className="editor-panel" aria-label="原文编辑">
      <header className="panel-header">
        <div>
          <p className="eyebrow">CTN Source</p>
          <h2>{title}</h2>
        </div>
        <div className="stats">
          <span>{lineCount} 行</span>
          <span>{totalBlocks} 个块</span>
          <span>{outline.length} 个根节点</span>
          <span>{parsedDocument.diagnostics.length} 个诊断</span>
          {hasActiveNote ? (
            <select
              aria-label="笔记语法"
              className="syntax-profile-select"
              value={selectedSyntaxProfileValue}
              onChange={(event) => changeSyntaxProfile(event.target.value)}
            >
              {!syntaxProfile ? (
                <option value="" disabled>
                  语法缺失
                </option>
              ) : null}
              {syntaxProfiles.map((profile) => (
                <option key={syntaxProfileOptionValue(profile)} value={syntaxProfileOptionValue(profile)}>
                  {profile.name}@{profile.version}
                </option>
              ))}
            </select>
          ) : (
            <span>{syntaxProfile?.name ?? "无语法"}</span>
          )}
        </div>
      </header>

      {hasActiveNote && syntaxProfile ? (
        <CtnEditor
          focusTarget={focusTarget}
          syntaxProfile={syntaxProfile}
          value={documentText}
          onChange={onDocumentTextChange}
        />
      ) : hasActiveNote ? (
        <textarea
          className="source-editor-fallback"
          spellCheck={false}
          value={documentText}
          onChange={(event) => onDocumentTextChange(event.target.value)}
        />
      ) : (
        <div className="empty-editor">
          <h3>尚无笔记</h3>
          <button className="primary-action-button" onClick={onCreateNote} type="button">
            新建笔记
          </button>
        </div>
      )}

      {hasActiveNote && syntaxIssueMessage ? (
        <section className="diagnostics-panel" aria-label="语法状态">
          <h3>语法</h3>
          <p>{syntaxIssueMessage}</p>
        </section>
      ) : null}

      {hasActiveNote && parsedDocument.diagnostics.length > 0 ? (
        <section className="diagnostics-panel" aria-label="诊断">
          <h3>诊断</h3>
          <ul>
            {parsedDocument.diagnostics.map((diagnostic) => (
              <li key={diagnostic.id}>
                <span className="diagnostic-location">
                  L{diagnostic.lineNumber}
                </span>
                <span>{diagnostic.message}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
