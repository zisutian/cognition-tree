import { useMemo, useState } from "react";
import { EditorPanel } from "./components/EditorPanel";
import { OutlinePanel } from "./components/OutlinePanel";
import {
  type ActivityKey,
  WorkspaceSidebar,
} from "./components/WorkspaceSidebar";
import { parseCtnDocument } from "./ctn/parseOutline";
import { useNoteWorkspace } from "./hooks/useNoteWorkspace";
import "./App.css";

type EditorFocusRequest = {
  lineNumber: number;
  requestId: number;
};

function App() {
  const [activeActivity, setActiveActivity] = useState<ActivityKey>("notes");
  const [editorFocusRequest, setEditorFocusRequest] =
    useState<EditorFocusRequest | null>(null);
  const {
    activeNote,
    createNote,
    selectNote,
    storageLabel,
    updateActiveNoteSource,
    workspace,
  } = useNoteWorkspace();
  const documentText = activeNote.source;
  const parsedDocument = useMemo(
    () => parseCtnDocument(documentText),
    [documentText],
  );
  const lineCount = documentText.split("\n").length;
  const focusEditorLine = (lineNumber: number) => {
    setEditorFocusRequest((current) => ({
      lineNumber,
      requestId: (current?.requestId ?? 0) + 1,
    }));
  };

  return (
    <main className="app-shell">
      <WorkspaceSidebar
        activeActivity={activeActivity}
        activeNoteId={activeNote.id}
        diagnosticsCount={parsedDocument.diagnostics.length}
        lineCount={lineCount}
        notes={workspace.notes}
        noteTree={workspace.tree}
        outline={parsedDocument.roots}
        storageLabel={storageLabel}
        totalBlocks={parsedDocument.blocks.length}
        onActivityChange={setActiveActivity}
        onCreateNote={createNote}
        onSelectLine={focusEditorLine}
        onSelectNote={selectNote}
      />

      <EditorPanel
        documentText={documentText}
        focusTarget={editorFocusRequest}
        parsedDocument={parsedDocument}
        title={activeNote.title}
        onDocumentTextChange={updateActiveNoteSource}
      />

      <OutlinePanel
        diagnosticsCount={parsedDocument.diagnostics.length}
        nodes={parsedDocument.roots}
        totalBlocks={parsedDocument.blocks.length}
        onSelectLine={focusEditorLine}
      />
    </main>
  );
}

export default App;
