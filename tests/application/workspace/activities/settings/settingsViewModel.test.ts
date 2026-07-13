import { describe, expect, it, vi } from "vitest";
import { createSettingsViewModel } from "../../../../../src/application/workspace/activities/settings/settingsViewModel";

function createSource(
  overrides: Partial<Parameters<typeof createSettingsViewModel>[0]> = {},
): Parameters<typeof createSettingsViewModel>[0] {
  return {
    discardPendingChangesAndReload: vi.fn(async () => undefined),
    reload: vi.fn(async () => undefined),
    repositoryPath: "/workspace",
    saveStatus: "saved",
    status: "ready",
    storageLabel: "本地仓库",
    ...overrides,
  };
}

describe("settings view model", () => {
  it("projects repository state into settings display values", () => {
    const source = createSource({ saveStatus: "saving" });

    expect(createSettingsViewModel(source)).toEqual({
      discardPendingChangesAndReload: source.discardPendingChangesAndReload,
      hasSaveConflict: false,
      reload: source.reload,
      repositoryPath: "/workspace",
      saveStatusLabel: "保存中",
      storageLabel: "本地仓库",
    });
  });

  it("gives repository conflicts precedence over queue status", () => {
    expect(
      createSettingsViewModel(
        createSource({ saveStatus: "error", status: "conflict" }),
      ),
    ).toMatchObject({
      hasSaveConflict: true,
      saveStatusLabel: "磁盘内容已更改",
    });
  });
});
