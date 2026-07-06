import { describe, expect, it } from "vitest";
import {
  getMoveBlockFailureMessage,
  getMoveBlockSuccessMessage,
} from "../../../../src/application/workspace/projection/viewMigrationMessages";

describe("workspace migration view messages", () => {
  it("maps migration result codes to application messages", () => {
    expect(getMoveBlockSuccessMessage()).toBe("块迁移完成。");
    expect(getMoveBlockFailureMessage("same-note-unsupported")).toBe(
      "第一版不支持同一笔记内移动块。",
    );
    expect(getMoveBlockFailureMessage("source-block-missing")).toBe("源块不存在。");
    expect(getMoveBlockFailureMessage("target-position-missing")).toBe(
      "目标插入位置不存在。",
    );
  });
});
