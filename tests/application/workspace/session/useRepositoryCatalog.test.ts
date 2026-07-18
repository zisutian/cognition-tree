import { describe, expect, it } from "vitest";
import { reuseUnchangedRepositoryDescriptors } from "../../../../src/application/workspace/session/useRepositoryCatalog";
import type { WorkspaceRepositoryDescriptor } from "../../../../src/storage/repository/workspaceRepositoryCatalog";

const descriptor: WorkspaceRepositoryDescriptor = {
  adapter: "local",
  id: "primary",
  label: "Primary",
  location: {
    hostPath: "/host/primary",
    serverPath: "/data/primary",
    type: "local",
  },
};

describe("repository catalog descriptor identity", () => {
  it("keeps an active repository session stable across issue-only refreshes", () => {
    const equivalent = {
      ...descriptor,
      location: { ...descriptor.location },
    };
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
