import { describe, expect, it, vi } from "vitest";
import {
  reuseUnchangedRepositoryDescriptors,
} from "../../../application/repository/repositoryCatalog";
import { createRepositoryCatalogController } from
  "../../../application/repository/repositoryCatalogController";
import type {
  WorkspaceRepositoryCatalog,
  WorkspaceRepositoryCatalogData,
  WorkspaceRepositoryDescriptor,
} from "../../../application/repository/workspaceRepositoryCatalog";

const descriptor: WorkspaceRepositoryDescriptor = {
  id: "primary",
  label: "Primary",
  location: {
    hostPath: "/host/primary",
    serverPath: "/data/primary",
  },
  labelIssue: null,
};

function catalogData(
  repositories: WorkspaceRepositoryDescriptor[] = [descriptor],
): WorkspaceRepositoryCatalogData {
  return {
    issues: [],
    repositories,
  };
}

function createHarness(initial = catalogData()) {
  let activeId: string | null = descriptor.id;
  const catalog: WorkspaceRepositoryCatalog = {
    deleteRepository: vi.fn(),
    label: "Repositories",
    listRepositories: vi.fn(async () => initial),
    renameRepository: vi.fn(),
  };
  const provisionRepository = vi.fn();
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
    provisionRepository,
  });

  return {
    activeId: () => activeId,
    catalog,
    controller,
    provisionRepository,
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

});

describe("repository catalog controller", () => {
  it("delegates validated creation without owning Workspace content", async () => {
    const harness = createHarness();
    const created = { ...descriptor, id: "created", label: "Created" };

    harness.provisionRepository.mockResolvedValueOnce(created);
    await harness.controller.reload();
    await expect(harness.controller.createRepository({
      name: "  Created  ",
    })).resolves.toBe(created);

    expect(harness.provisionRepository).toHaveBeenCalledWith(
      { name: "  Created  " },
      "Created",
    );
    expect(harness.controller.getSnapshot().activeDescriptor).toBe(created);
  });

  it("loads the active descriptor and retains selection across rename", async () => {
    const harness = createHarness();

    await harness.controller.reload();
    expect(harness.controller.getSnapshot()).toMatchObject({
      activeDescriptor: descriptor,
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
  });

  it("persists selection and publishes the replacement descriptor", async () => {
    const secondary = { ...descriptor, id: "secondary", label: "Secondary" };
    const harness = createHarness(catalogData([descriptor, secondary]));

    await harness.controller.reload();
    await harness.controller.selectRepository("secondary");

    expect(harness.activeId()).toBe("secondary");
    expect(harness.controller.getSnapshot().activeDescriptor).toBe(secondary);
  });

  it("publishes synchronous local deletion without background polling", async () => {
    const harness = createHarness();

    await harness.controller.reload();
    vi.mocked(harness.catalog.listRepositories).mockResolvedValueOnce(
      catalogData([]),
    );
    await harness.controller.deleteRepository({ id: descriptor.id });

    expect(harness.catalog.deleteRepository).toHaveBeenCalledWith({
      id: descriptor.id,
    });
    expect(harness.controller.getSnapshot()).toMatchObject({
      activeDescriptor: null,
      state: { activeRepositoryId: null, repositories: [] },
    });
  });
});
