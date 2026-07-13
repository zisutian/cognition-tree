import type {
  ReferenceGraphMode,
} from "../../../application/workspace/view-model/activityViewModels";

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
      description: "创建笔记后会在这里显示引用图谱。",
      title: "没有笔记",
    };
  }

  if (mode === "local" && !hasActiveNote) {
    return {
      description: "选择一个笔记后显示它周围的引用关系。",
      title: "未选择笔记",
    };
  }

  if (query.trim()) {
    return {
      description: "当前标题搜索没有匹配节点。",
      title: "没有匹配节点",
    };
  }

  if (hideIsolated) {
    return {
      description: "过滤条件隐藏了全部孤立节点。",
      title: "没有可显示节点",
    };
  }

  return {
    description: "当前图谱没有可显示的引用关系。",
    title: "没有可显示节点",
  };
}
