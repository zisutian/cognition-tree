import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { defaultCtnSyntaxProfile } from "../../../../src/ctn/syntax/defaultSyntaxProfile";
import { NoteEditorPanel } from "../../../../src/ui/activities/notes/NoteEditorPanel";

describe("NoteEditorPanel", () => {
  it("renders the editor header with the current note but without count stats", () => {
    const markup = renderToStaticMarkup(
      <NoteEditorPanel
        currentNoteTitle="非常长的当前笔记标题"
        diagnostics={[]}
        errorMessage=""
        focusTarget={null}
        hasActiveNote
        syntaxProfile={defaultCtnSyntaxProfile}
        value="# 非常长的一行内容"
        onCreateNote={() => undefined}
        onDocumentTextChange={() => undefined}
      />,
    );

    expect(markup).toContain("<h2>笔记编辑</h2>");
    expect(markup).toContain('class="note-current-title"');
    expect(markup).toContain("当前：非常长的当前笔记标题");
    expect(markup).not.toContain("ui-panel-stats");
    expect(markup).not.toContain("note-editor-count-row");
    expect(markup).not.toContain("12 行");
    expect(markup).not.toContain("8 个块");
    expect(markup).not.toContain("3 个根节点");
    expect(markup).not.toContain("1 个诊断");
  });
});
