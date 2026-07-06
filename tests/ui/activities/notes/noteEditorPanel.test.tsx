import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { defaultCtnSyntaxProfile } from "../../../../src/ctn/syntax/defaultSyntaxProfile";
import { NoteEditorPanel } from "../../../../src/ui/activities/notes/NoteEditorPanel";

describe("NoteEditorPanel", () => {
  it("renders the editor header with a current note row and a count row", () => {
    const markup = renderToStaticMarkup(
      <NoteEditorPanel
        currentNoteTitle="非常长的当前笔记标题"
        diagnostics={[]}
        errorMessage=""
        focusTarget={null}
        hasActiveNote
        lineCount={12}
        rootCount={3}
        syntaxProfile={defaultCtnSyntaxProfile}
        totalBlocks={8}
        totalDiagnostics={1}
        value="# 非常长的一行内容"
        onCreateNote={() => undefined}
        onDocumentTextChange={() => undefined}
      />,
    );

    expect(markup).toContain("<h2>笔记编辑</h2>");
    expect(markup).toContain('class="current-note-chip"');
    expect(markup).toContain("当前：非常长的当前笔记标题");
    expect(markup).toContain('class="note-editor-count-row"');

    const currentNoteIndex = markup.indexOf('class="current-note-chip"');
    const countRowIndex = markup.indexOf('class="note-editor-count-row"');
    const countRowMarkup = markup.slice(
      countRowIndex,
      markup.indexOf('<div class="source-editor"', countRowIndex),
    );

    expect(currentNoteIndex).toBeGreaterThan(-1);
    expect(countRowIndex).toBeGreaterThan(currentNoteIndex);
    expect(countRowMarkup).toContain("<span>12 行</span>");
    expect(countRowMarkup).toContain("<span>8 个块</span>");
    expect(countRowMarkup).toContain("<span>3 个根节点</span>");
    expect(countRowMarkup).toContain("<span>1 个诊断</span>");
  });
});
