import type { MoveWorkspaceBlockFailureReason } from "../../../workspace/commands/blockMigrationCommands";

const moveBlockFailureMessages: Record<MoveWorkspaceBlockFailureReason, string> = {
  "missing-note": "源笔记或目标笔记不存在。",
  "parsed-note-missing": "笔记解析结果不存在。",
  "same-note-unsupported": "源笔记和目标笔记不能相同。",
  "source-block-missing": "源结构不存在。",
  "target-position-missing": "目标位置不存在。",
};

export function getMoveBlockFailureMessage(
  reason: MoveWorkspaceBlockFailureReason,
) {
  return moveBlockFailureMessages[reason];
}

export function getMoveBlockSuccessMessage() {
  return "结构移动完成。";
}
