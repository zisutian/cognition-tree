import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  NoteDetailPanel,
  NoteEditorPanel,
  NotesContext,
  findNotesTreeAncestorFolderIds,
  submitNotesEditorChange,
  submitNotesFolderCreation,
} from "../../../../presentation/activities/views/notes/NotesPanels";
import { NoteTimeDetails } from "../../../../presentation/activities/views/notes/NoteTimeDetails";
import { runFeedbackAction } from "../../../../presentation/ui/shared/FeedbackProvider";
import { createView } from "../../viewFactory";

describe("notes panels", () => {
  it("finds every collapsed ancestor needed to reveal a selected name issue", () => {
    const note = {
      canDrag: true,
      folderId: "folder-inner",
      id: "note:note-old",
      kind: "note" as const,
      noteId: "note-old",
      parentFolderId: "folder-inner",
      title: "旧:标题",
    };
    const inner = {
      canDrag: true,
      childCount: 1,
      children: [note],
      folderId: "folder-inner",
      id: "folder:folder-inner",
      kind: "folder" as const,
      parentFolderId: "folder-outer",
      title: "内层",
    };
    const outer = {
      canDrag: true,
      childCount: 1,
      children: [inner],
      folderId: "folder-outer",
      id: "folder:folder-outer",
      kind: "folder" as const,
      parentFolderId: null,
      title: "外层",
    };

    expect(findNotesTreeAncestorFolderIds(
      [outer],
      { kind: "note", noteId: "note-old" },
    )).toEqual(["folder-outer", "folder-inner"]);
    expect(findNotesTreeAncestorFolderIds(
      [outer],
      { folderId: "folder-inner", kind: "folder" },
    )).toEqual(["folder-outer"]);
  });

  it("reports folder creation errors without closing the creation form", () => {
    const error = new Error("Workspace folder title contains unsupported characters.");
    const notifyError = vi.fn();
    const onCreated = vi.fn();
    const createFolder = vi.fn(() => {
      throw error;
    });

    submitNotesFolderCreation({
      directory: { activeFolderId: "folder-parent", createFolder },
      folderTitle: "bad/name",
      onCreated,
      runAction: (action) => runFeedbackAction(action, notifyError),
    });

    expect(createFolder).toHaveBeenCalledWith("folder-parent", "bad/name");
    expect(notifyError).toHaveBeenCalledWith(error);
    expect(onCreated).not.toHaveBeenCalled();
  });

  it.each([
    {
      authoritativeSource: "当前标题\n正文",
      label: "configured",
      source: "bad:title\n正文",
    },
    {
      authoritativeSource: "当前标题\n@ctn-block id=block-1 created=now updated=now\n正文",
      label: "raw",
      source: "bad:title\n@ctn-block id=block-1 created=now updated=now\n正文",
    },
  ])("reports and rolls back an invalid colon title in $label mode", ({
    authoritativeSource,
    source,
  }) => {
    const error = new Error(
      "Workspace note title contains unsupported characters.",
    );
    const notifyError = vi.fn();
    const onNormalized = vi.fn();
    const onSynchronize = vi.fn();

    const result = submitNotesEditorChange({
      authoritativeSource,
      change: {
        edits: [{ from: 0, insertedText: source, to: authoritativeSource.length }],
        source,
      },
      onNormalized,
      onSynchronize,
      runAction: (action) => runFeedbackAction(action, notifyError),
      updateSource: () => {
        throw error;
      },
    });

    expect(result).toBeUndefined();
    expect(notifyError).toHaveBeenCalledWith(error);
    expect(onNormalized).not.toHaveBeenCalled();
    expect(onSynchronize).toHaveBeenCalledWith(authoritativeSource);
  });

  it("synchronizes normalized titles to the authoritative editor source", () => {
    const source = "  Cafe\u0301   标题  \n正文";
    const canonicalSource = "Café 标题\n正文";
    const notify = vi.fn();
    const onSynchronize = vi.fn();

    const result = submitNotesEditorChange({
      authoritativeSource: "旧标题\n正文",
      change: {
        edits: [{ from: 0, insertedText: source, to: 5 }],
        source,
      },
      onNormalized: () => notify(
        "笔记标题已按可移植名称规则规范化。",
      ),
      onSynchronize,
      runAction: (action) => action(),
      updateSource: () => ({
        authoritativeSource: canonicalSource,
        titleNormalized: true,
      }),
    });

    expect(result).toEqual({
      authoritativeSource: canonicalSource,
      titleNormalized: true,
    });
    expect(notify).toHaveBeenCalledWith(
      "笔记标题已按可移植名称规则规范化。",
    );
    expect(onSynchronize).toHaveBeenCalledWith(canonicalSource);
  });

  it("does not force a rollback when the repository accepts the editor text", () => {
    const source = "旧:标题\n已修改正文";
    const onNormalized = vi.fn();
    const onSynchronize = vi.fn();

    submitNotesEditorChange({
      authoritativeSource: "旧:标题\n正文",
      change: {
        edits: [{ from: 5, insertedText: "已修改", to: 5 }],
        source,
      },
      onNormalized,
      onSynchronize,
      runAction: (action) => action(),
      updateSource: () => ({
        authoritativeSource: source,
        titleNormalized: false,
      }),
    });

    expect(onNormalized).not.toHaveBeenCalled();
    expect(onSynchronize).not.toHaveBeenCalled();
  });

  it("keeps block timestamps in a compact detail view", () => {
    const markup = renderToStaticMarkup(
      <NoteTimeDetails
        blockMetadata={{
          createdAt: "2026-07-15T00:00:00.000Z",
          updatedAt: "2026-07-15T01:00:00.000Z",
        }}
        noteMetadata={{
          createdAt: "2026-07-14T00:00:00.000Z",
          updatedAt: "2026-07-14T01:00:00.000Z",
        }}
      />,
    );

    expect(markup).toContain('aria-label="块时间"');
    expect(markup).toContain('aria-label="笔记时间"');
    expect(markup).toContain('aria-label="时间信息"');
    expect(markup).toContain("当前块");
    expect(markup).toContain("创建");
    expect(markup).toContain("更新");
    expect(markup).toContain('dateTime="2026-07-15T00:00:00.000Z"');
    expect(markup).not.toContain("@ctn-block");
  });

  it("shows note timestamps independently from the active block", () => {
    const markup = renderToStaticMarkup(
      <NoteDetailPanel
        onCollapseDetail={() => undefined}
        view={createView().notes}
      />,
    );

    expect(markup).toContain('aria-label="笔记时间"');
    expect(markup).toContain("修改");
    expect(markup).toContain('dateTime="2026-01-01T00:00:00.000Z"');
    expect(markup).toContain('dateTime="2026-01-02T00:00:00.000Z"');
    expect(markup).not.toContain('aria-label="块时间"');
  });

  it("exposes the workbench focus mode command from the editor title bar", () => {
    const view = createView().notes;
    const normalMarkup = renderToStaticMarkup(
      <NoteEditorPanel
        focusMode={false}
        onToggleFocusMode={() => undefined}
        view={view}
      />,
    );
    const focusedMarkup = renderToStaticMarkup(
      <NoteEditorPanel
        focusMode
        onToggleFocusMode={() => undefined}
        view={view}
      />,
    );

    expect(normalMarkup).toContain("进入专注模式");
    expect(focusedMarkup).toContain("退出专注模式");
  });

  it("keeps note and folder selection visually exclusive in the directory", () => {
    const baseView = createView();
    const markup = renderToStaticMarkup(
      <NotesContext
        view={{
          ...baseView.notes,
          directory: {
            ...baseView.notes.directory,
            activeFolderId: "folder-1",
            activeNode: { folderId: "folder-1", kind: "folder" },
            noteTree: [
              {
                canDrag: true,
                childCount: 1,
                children: [
                  {
                    canDrag: true,
                    folderId: "folder-1",
                    id: "tree-note-1",
                    kind: "note",
                    noteId: "note-1",
                    parentFolderId: "folder-1",
                    title: "当前笔记",
                  },
                ],
                folderId: "folder-1",
                id: "folder-1",
                kind: "folder",
                parentFolderId: null,
                title: "文件夹",
              },
            ],
          },
        }}
      />,
    );

    expect(markup.match(/ui-tree-row-frame is-selected/g) ?? []).toHaveLength(1);
    expect(markup).toContain("文件夹");
    expect(markup).toContain("当前笔记");
  });

  it("keeps note detail focused on structure, metadata, and note statistics", () => {
    const baseView = createView();
    const activeBlock = {
      children: [],
      endLineNumber: 2,
      hasDiagnostics: false,
      id: "outline-2",
      label: "定义",
      lineLabel: "L2",
      lineNumber: 2,
      metadata: {
        createdAt: "2026-07-15T00:00:00.000Z",
        updatedAt: "2026-07-15T01:00:00.000Z",
      },
      textDisplay: {
        displayText: "子结构",
        segments: [{ id: "text", kind: "text" as const, text: "子结构" }],
        textColor: "default" as const,
      },
    };
    const markup = renderToStaticMarkup(
      <NoteDetailPanel
        onCollapseDetail={() => undefined}
        view={{
          ...baseView.notes,
          editor: {
            ...baseView.notes.editor,
            stats: {
              lineCount: 8,
              rootCount: 1,
              totalBlocks: 2,
            },
            syntax: {
              ...baseView.notes.editor.syntax,
              tabDisplayWidth: 6,
            },
          },
          outline: {
            activeBlock,
            nodes: [
              {
                children: [activeBlock],
                endLineNumber: 2,
                hasDiagnostics: false,
                id: "outline-1",
                label: "T",
                lineLabel: "L1",
                lineNumber: 1,
                metadata: {
                  createdAt: "2026-07-15T00:00:00.000Z",
                  updatedAt: "2026-07-15T00:00:00.000Z",
                },
                textDisplay: {
                  displayText: "当前笔记",
                  segments: [{ id: "text", kind: "text", text: "当前笔记" }],
                  textColor: "default",
                },
              },
            ],
            onSelectLine: () => undefined,
          },
        }}
      />,
    );

    expect(markup).toContain("detail-summary-strip");
    expect(markup).toContain("--ui-structure-depth:1");
    expect(markup).toContain("--ui-structure-indent-width:21px");
    expect(markup).toContain("ui-structure-tree-row is-selected");
    expect(markup).toContain('aria-label="块时间"');
    expect(markup).toContain('dateTime="2026-07-15T01:00:00.000Z"');
    expect(markup).toContain('aria-label="笔记统计"');
    expect(markup).not.toContain("诊断");
    expect(markup).not.toContain("detail-line-list");
    expect(markup).not.toContain("ui-section-title");
    expect(markup).not.toContain("ui-metrics");
    expect(markup).not.toContain("dense-list");
  });
});
