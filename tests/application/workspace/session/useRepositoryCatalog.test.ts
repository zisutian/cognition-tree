import { describe, expect, it } from "vitest";
import {
  createRepositoryConnectionKey,
  reuseUnchangedRepositoryDescriptors,
} from "../../../../presentation/activities/bindings/workspace/session/useRepositoryCatalog";
import type { WorkspaceRepositoryDescriptor } from "../../../../application/repository/workspaceRepositoryCatalog";

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
