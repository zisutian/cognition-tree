import { describe, expect, it } from "vitest";
import {
  getMoveBlockFailureMessage,
  getMoveBlockSuccessMessage,
} from "../../../../src/application/workspace/view-model/migrationMessages";

describe("structure operation view messages", () => {
  it("maps move result codes to user-facing messages", () => {
    expect(getMoveBlockSuccessMessage()).toBe("结构移动完成。");
    expect(getMoveBlockFailureMessage("same-note-unsupported")).toBe(
      "源笔记和目标笔记不能相同。",
    );
    expect(getMoveBlockFailureMessage("source-block-missing")).toBe("源结构不存在。");
    expect(getMoveBlockFailureMessage("target-position-missing")).toBe(
      "目标位置不存在。",
    );
  });
});
