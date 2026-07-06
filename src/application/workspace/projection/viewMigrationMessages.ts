import type { MoveWorkspaceBlockFailureReason } from "../../../workspace/commands/blockMigrationCommands";

const moveBlockFailureMessages: Record<MoveWorkspaceBlockFailureReason, string> = {
  "missing-note": "源笔记或目标笔记不存在。",
  "parsed-note-missing": "笔记解析结果不存在。",
  "same-note-unsupported": "第一版不支持同一笔记内移动块。",
  "source-block-missing": "源块不存在。",
  "target-position-missing": "目标插入位置不存在。",
};

export function getMoveBlockFailureMessage(
  reason: MoveWorkspaceBlockFailureReason,
) {
  return moveBlockFailureMessages[reason];
}

export function getMoveBlockSuccessMessage() {
  return "块迁移完成。";
}
