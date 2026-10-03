import { renderToStaticMarkup } from "../../../support/presentation/render";
import { describe, expect, it } from "vitest";
import {
  NoteTree,
  StructureTree,
} from "../../../../presentation/ui/shared/tree/index";
import { ContentTreeLabelPreferenceProvider } from "../../../../presentation/ui/shared/tree/ContentTreeLabelPreference";

describe("treeAccessibility", () => {
  it("hides folder children when folder collapse state is controlled", () => {
    const markup = renderToStaticMarkup(
      <NoteTree
        contentKey="test"
        selectedIds={new Set(["tree-note-1"])}
        onSelectionChange={() => undefined}
        collapsedFolderIds={new Set(["folder-1"])}
        nodes={[
          {
            canDrag: true,
            children: [
              {
                canDrag: true,
                folderId: "folder-1",
                id: "tree-note-1",
                kind: "note",
                noteId: "note-1",
                parentFolderId: "folder-1",
                title: "折叠中的笔记",
              },
            ],
            folderId: "folder-1",
            id: "folder-1",
            kind: "folder",
            parentFolderId: null,
            title: "文件夹",
          },
        ]}
        onToggleFolder={() => undefined}
      />,
    );

    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain("折叠中的笔记");
  });

  it("allows empty folders to receive children using package branch semantics", () => {
    const markup = renderToStaticMarkup(
      <NoteTree
        contentKey="test"
        selectedIds={new Set(["tree-note-1"])}
        onSelectionChange={() => undefined}
        nodes={[
          {
            canDrag: true,
            children: [],
            folderId: "folder-empty",
            id: "folder-empty",
            kind: "folder",
            parentFolderId: null,
            title: "空文件夹",
          },
        ]}
      />,
    );

    expect(markup).toContain("空文件夹");
    expect(markup).toContain("aria-expanded=");
  });

  it("provides inline rename and delete entry points without inline confirmation", () => {
    const markup = renderToStaticMarkup(
      <NoteTree
        contentKey="test"
        selectedIds={new Set(["tree-note-1"])}
        onSelectionChange={() => undefined}
        nodes={[
          {
            canDrag: true,
            folderId: null,
            id: "tree-note-1",
            kind: "note",
            noteId: "note-1",
            parentFolderId: null,
            title: "当前笔记",
          },
        ]}
        onDeleteNode={() => undefined}
        onRenameNode={() => undefined}
      />,
    );

    expect(markup).toContain('aria-label="重命名 当前笔记"');
    expect(markup).toContain('aria-label="删除 当前笔记"');
    expect(markup).not.toContain(">确认<");
    expect(markup).not.toContain('role="alertdialog"');
  });

  it("uses active node selection to keep note and folder selection exclusive", () => {
    const markup = renderToStaticMarkup(
      <NoteTree
        contentKey="test"
        selectedIds={new Set(["tree-note-1"])}
        onSelectionChange={() => undefined}
        nodes={[
          {
            canDrag: true,
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
        ]}
      />,
    );

    expect(markup.match(/aria-selected="true"/g) ?? []).toHaveLength(1);
    expect(markup).toContain('role="tree"');
    expect(markup.match(/role="treeitem"/g) ?? []).toHaveLength(2);
    expect(markup.match(/aria-selected="true"/g) ?? []).toHaveLength(1);
  });

  it("renders structure hierarchy, text markers, and line metadata", () => {
    const markup = renderToStaticMarkup(
      <ContentTreeLabelPreferenceProvider initialVisible onChange={() => undefined}>
      <StructureTree
        ariaLabel="测试结构"
        selectionMode="single"
        selectedIds={new Set()}
        onSelectionChange={() => undefined}
        nodes={[
          {
            children: [
              {
                children: [],
                diagnostics: [],
                id: "block-2",
                label: "顶格概念",
                lineLabel: "L2",
                lineNumber: 2,
                textDisplay: {
                  displayText: "子节点",
                  segments: [{ id: "text", kind: "text", text: "子节点" }],
                  textColor: "default",
                },
              },
            ],
            diagnostics: [{ severity: "warning", message: "提示" }],
            id: "block-1",
            label: "组分",
            lineLabel: "L1",
            lineNumber: 1,
            textDisplay: {
              displayText: "标题",
              segments: [{ id: "text", kind: "text", text: "标题" }],
              textColor: "default",
            },
          },
        ]}
        stateKey="accessibility-structure"
      />
      </ContentTreeLabelPreferenceProvider>,
    );

    expect(markup).toContain('role="tree"');
    expect(markup.match(/role="treeitem"/g) ?? []).toHaveLength(2);
    expect(markup).toContain('aria-level="1"');
    expect(markup).toContain('aria-level="2"');
    expect(markup).toContain("提示");
    expect(markup).toContain("组分");
    expect(markup).toContain("顶格概念");
    expect(markup).toContain("L1");
  });

  it("highlights only selected rows while the subtree remains present", () => {
    const markup = renderToStaticMarkup(
      <ContentTreeLabelPreferenceProvider initialVisible onChange={() => undefined}>
      <StructureTree
        ariaLabel="测试选择"
        selectionMode="multiple"
        selectedIds={new Set(["block-1"])}
        nodes={[
          {
            children: [
              {
                children: [],
                diagnostics: [],
                id: "block-2",
                label: "定义",
                lineLabel: "L2",
                lineNumber: 2,
                textDisplay: {
                  displayText: "子块",
                  segments: [{ id: "text", kind: "text", text: "子块" }],
                  textColor: "default",
                },
              },
            ],
            diagnostics: [],
            id: "block-1",
            label: "组分",
            lineLabel: "L1",
            lineNumber: 1,
            textDisplay: {
              displayText: "根块",
              segments: [{ id: "text", kind: "text", text: "根块" }],
              textColor: "default",
            },
          },
        ]}
        stateKey="accessibility-selection"
        onSelectionChange={() => undefined}
      />
      </ContentTreeLabelPreferenceProvider>,
    );

    expect(markup.match(/aria-selected="true"/g) ?? []).toHaveLength(1);
    expect(markup).toContain('aria-multiselectable="true"');
  });
});
