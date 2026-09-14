import type {
  ReferenceGraphMode,
} from "../../../../application/workspace/index.ts";

export function getEmptyGraphMessage({
  graphNodeCount,
  hasActiveNote,
  hideIsolated,
  mode,
  query,
}: {
  graphNodeCount: number;
  hasActiveNote: boolean;
  hideIsolated: boolean;
  mode: ReferenceGraphMode;
  query: string;
}) {
  if (graphNodeCount === 0) {
    return {
      title: "没有笔记",
    };
  }

  if (mode === "local" && !hasActiveNote) {
    return {
      title: "未选择笔记",
    };
  }

  if (query.trim()) {
    return {
      title: "没有匹配节点",
    };
  }

  if (hideIsolated) {
    return {
      title: "孤立节点已隐藏",
    };
  }

  return {
    title: "没有可显示节点",
  };
}
