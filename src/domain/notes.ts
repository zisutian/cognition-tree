import { defaultCtnSyntaxProfile } from "../ctn/parseOutline";

export type NoteId = string;

export type NoteRecord = {
  id: NoteId;
  title: string;
  source: string;
  syntaxProfileId: string;
  syntaxVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type NoteTreeNode =
  | {
      id: string;
      kind: "folder";
      title: string;
      children: NoteTreeNode[];
    }
  | {
      id: string;
      kind: "note";
      noteId: NoteId;
    };

export type NoteWorkspace = {
  id: string;
  name: string;
  activeNoteId: NoteId;
  notes: NoteRecord[];
  tree: NoteTreeNode[];
};

export const initialNoteSource = `认知树
  : 本地优先的可配置语法认知树笔记
  [理解] 当前编辑器已经接入 CodeMirror 6
    [证据] 行号、活动行、Tab 缩进和基础高亮可用
    [证据] 右侧结构树会随原文实时更新
  [?] 下一步如何靠近真实笔记体验
    [证据] 结构树节点可以定位到原文行
    [证据] 诊断行支持悬浮提示
    [证据] 结构树可以按阅读需要缩放
    [条件] 先用文件库保存原文笔记
  [组分] 第一阶段闭环
    [例子] 原文编辑
    [例子] 结构预览
    [例子] 文件保存
    [例子] 纯文本和 JSON 导出`;

export const syntaxLabSource = `语法实验
  : 默认语法仍然以 CTN 符号为主
  [?] 自定义语法先保留在解析器 profile 层
  [理解] UI 配置入口需要等存储模型稳定后再展开`;

export function inferNoteTitle(source: string): string {
  return source
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean) ?? "未命名笔记";
}

export function createNoteRecord(
  id: NoteId,
  source: string,
  timestamp: string,
): NoteRecord {
  return {
    id,
    title: inferNoteTitle(source),
    source,
    syntaxProfileId: defaultCtnSyntaxProfile.id,
    syntaxVersion: defaultCtnSyntaxProfile.version,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function appendNoteToWorkspaceTree(
  tree: NoteTreeNode[],
  noteId: NoteId,
): NoteTreeNode[] {
  return tree.map((node) => {
    if (node.kind !== "folder" || node.id !== "folder-inbox") {
      return node;
    }

    return {
      ...node,
      children: [
        ...node.children,
        {
          id: `tree-${noteId}`,
          kind: "note",
          noteId,
        },
      ],
    };
  });
}

export function createInitialWorkspace(timestamp = new Date().toISOString()) {
  return {
    id: "local-workspace",
    name: "本地笔记库",
    activeNoteId: "note-cognition-tree",
    notes: [
      createNoteRecord("note-cognition-tree", initialNoteSource, timestamp),
      createNoteRecord("note-syntax-lab", syntaxLabSource, timestamp),
    ],
    tree: [
      {
        id: "folder-core",
        kind: "folder",
        title: "核心笔记",
        children: [
          {
            id: "tree-note-cognition-tree",
            kind: "note",
            noteId: "note-cognition-tree",
          },
        ],
      },
      {
        id: "folder-lab",
        kind: "folder",
        title: "实验区",
        children: [
          {
            id: "tree-note-syntax-lab",
            kind: "note",
            noteId: "note-syntax-lab",
          },
        ],
      },
      {
        id: "folder-inbox",
        kind: "folder",
        title: "未整理",
        children: [],
      },
    ],
  } satisfies NoteWorkspace;
}
