import { describe, expect, it, vi } from "vitest";
import { createSettingsViewModel } from "../../../../../src/application/workspace/activities/settings/settingsViewModel";

function createSource(
  overrides: Partial<Parameters<typeof createSettingsViewModel>[0]> = {},
): Parameters<typeof createSettingsViewModel>[0] {
  return {
    activeRepositoryId: "primary",
    contextWidth: 280,
    createRepository: vi.fn(async () => undefined),
    discardPendingChangesAndReload: vi.fn(async () => undefined),
    reload: vi.fn(async () => undefined),
    repositories: [
      {
        adapter: "local",
        id: "primary",
        label: "Primary",
        repositoryPath: "/workspace",
      },
    ],
    repositoryPath: "/workspace",
    saveStatus: "saved",
    status: "ready",
    storageLabel: "本地仓库",
    selectRepository: vi.fn(async () => undefined),
    setContextWidth: vi.fn(),
    ...overrides,
  };
}

describe("settings view model", () => {
  it("projects repository state into settings display values", () => {
    const source = createSource({ saveStatus: "saving" });

    expect(createSettingsViewModel(source)).toEqual({
      activeRepositoryId: "primary",
      contextWidth: 280,
      createRepository: source.createRepository,
      discardPendingChangesAndReload: source.discardPendingChangesAndReload,
      hasSaveConflict: false,
      reload: source.reload,
      repositories: source.repositories,
      repositoryPath: "/workspace",
      saveStatusLabel: "保存中",
      storageLabel: "本地仓库",
      selectRepository: source.selectRepository,
      setContextWidth: source.setContextWidth,
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
