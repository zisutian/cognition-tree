// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { isTodoCollectionId } from "../../../../core/todo/model/todoIdentity";
import { todoCollectionId } from "../todoTestFixture";

describe("Todo identity", () => {
  it("recognizes canonical collection ids only", () => {
    expect(isTodoCollectionId(todoCollectionId(1))).toBe(true);
    expect(isTodoCollectionId(todoCollectionId(1).toUpperCase())).toBe(false);
  });
});
