import { describe, expect, it, vi } from "vitest";
import {
  createRepositoryConnectionKey,
  reuseUnchangedRepositoryDescriptors,
} from "../../../application/repository/repositoryCatalog";
import {
  createRepositoryCatalogController,
  repositoryDeletionPollDelayMs,
} from "../../../application/repository/repositoryCatalogController";
import type {
  WorkspaceRepositoryCatalog,
  WorkspaceRepositoryCatalogData,
  WorkspaceRepositoryDescriptor,
} from "../../../application/repository/workspaceRepositoryCatalog";
import type {
  WorkspaceRepository,
  WorkspaceRepositoryContent,
} from "../../../application/repository/workspaceRepository";

const descriptor: WorkspaceRepositoryDescriptor = {
  adapter: "local",
  id: "primary",
  label: "Primary",
  location: {
    hostPath: "/host/primary",
    serverPath: "/data/primary",
    type: "local",
  },
  labelIssue: null,
};

function catalogData(
  repositories: WorkspaceRepositoryDescriptor[] = [descriptor],
): WorkspaceRepositoryCatalogData {
  return {
    creatableAdapters: ["local", "browser", "webdav"],
    issues: [],
    repositories,
  };
}

function createHarness(initial = catalogData()) {
  let activeId: string | null = descriptor.id;
  const repository = { label: "Primary" } as WorkspaceRepository;
  const catalog: WorkspaceRepositoryCatalog = {
    createRepository: vi.fn(),
    deleteRepository: vi.fn(),
    label: "Repositories",
    listRepositories: vi.fn(async () => initial),
    openRepository: vi.fn(() => repository),
    renameRepository: vi.fn(),
  };
  const scheduled: Array<{
    callback: () => void;
    cancelled: boolean;
    delayMs: number;
  }> = [];
  const controller = createRepositoryCatalogController({
    activeRepositorySelection: {
      clear: () => {
        activeId = null;
      },
      load: () => activeId,
      save: (repositoryId) => {
        activeId = repositoryId;
      },
    },
    catalog,
    createInitialContent: (label) => ({
      label,
    } as unknown as WorkspaceRepositoryContent),
    scheduler: {
      schedule(callback, delayMs) {
        const task = { callback, cancelled: false, delayMs };

        scheduled.push(task);
        return () => {
          task.cancelled = true;
        };
      },
    },
  });

  return {
    activeId: () => activeId,
    catalog,
    controller,
    repository,
    scheduled,
  };
}

describe("repository catalog descriptor identity", () => {
  it("keeps an active repository session stable across issue-only refreshes", () => {
    const equivalent = { ...descriptor, location: { ...descriptor.location } };
    const [reused] = reuseUnchangedRepositoryDescriptors(
      [descriptor],
      [equivalent],
    );

    expect(reused).toBe(descriptor);
  });

  it("publishes a changed descriptor when its visible contract changes", () => {
    const changed = { ...descriptor, label: "Renamed" };
    const [published] = reuseUnchangedRepositoryDescriptors(
      [descriptor],
      [changed],
    );

    expect(published).toBe(changed);
  });

  it("keeps label and conflict projection out of the active connection key", () => {
    expect(createRepositoryConnectionKey({
      ...descriptor,
      label: "Renamed",
      labelIssue: "conflict",
    })).toBe(createRepositoryConnectionKey(descriptor));
    expect(createRepositoryConnectionKey({
      ...descriptor,
      id: "another",
    })).not.toBe(createRepositoryConnectionKey(descriptor));
    expect(createRepositoryConnectionKey({
      ...descriptor,
      location: {
        hostPath: "/host/primary",
        serverPath: "/data/moved",
        type: "local",
      },
    })).not.toBe(createRepositoryConnectionKey(descriptor));
  });
});

describe("repository catalog controller", () => {
  it("loads the active repository and retains its session across rename", async () => {
    const harness = createHarness();

    await harness.controller.reload();
    expect(harness.controller.getSnapshot()).toMatchObject({
      activeDescriptor: descriptor,
      repository: harness.repository,
      state: { activeRepositoryId: "primary", status: "ready" },
    });

    const renamed = { ...descriptor, label: "Renamed" };

    vi.mocked(harness.catalog.listRepositories).mockResolvedValueOnce(
      catalogData([renamed]),
    );
    vi.mocked(harness.catalog.renameRepository).mockResolvedValueOnce(renamed);
    await harness.controller.renameRepository({ id: "primary", name: "Renamed" });

    expect(harness.controller.getSnapshot().activeDescriptor?.label).toBe(
      "Renamed",
    );
    expect(harness.catalog.openRepository).toHaveBeenCalledTimes(1);
  });

  it("persists selection and opens a replacement repository", async () => {
    const secondary = { ...descriptor, id: "secondary", label: "Secondary" };
    const harness = createHarness(catalogData([descriptor, secondary]));

    await harness.controller.reload();
    await harness.controller.selectRepository("secondary");

    expect(harness.activeId()).toBe("secondary");
    expect(harness.controller.getSnapshot().activeDescriptor).toBe(secondary);
    expect(harness.catalog.openRepository).toHaveBeenCalledTimes(2);
  });

  it("polls deleting issues only while started", async () => {
    const deleting = {
      ...catalogData([]),
      issues: [{
        adapter: "webdav" as const,
        code: "repository_busy" as const,
        id: "remote",
        location: { type: "webdav" as const, url: "https://example.test" },
        message: "Deleting",
        status: "deleting" as const,
      }],
    };
    const harness = createHarness(deleting);

    harness.controller.start();
    await vi.waitFor(() => {
      expect(harness.controller.getSnapshot().state.status).toBe("ready");
    });
    expect(harness.scheduled.at(-1)?.delayMs).toBe(
      repositoryDeletionPollDelayMs,
    );

    harness.controller.stop();
    expect(harness.scheduled.at(-1)?.cancelled).toBe(true);
  });
});
