import { CtnEditor, type CtnEditorFocusTarget } from "../editor/CtnEditor";
import type { CtnDocument } from "../ctn/parseOutline";

export function EditorPanel({
  documentText,
  focusTarget,
  parsedDocument,
  title,
  onDocumentTextChange,
}: {
  documentText: string;
  focusTarget: CtnEditorFocusTarget | null;
  parsedDocument: CtnDocument;
  title: string;
  onDocumentTextChange: (source: string) => void;
}) {
  const lineCount = documentText.split("\n").length;
  const totalBlocks = parsedDocument.blocks.length;
  const outline = parsedDocument.roots;

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
        </div>
      </header>

      <CtnEditor
        focusTarget={focusTarget}
        value={documentText}
        onChange={onDocumentTextChange}
      />

      {parsedDocument.diagnostics.length > 0 ? (
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
