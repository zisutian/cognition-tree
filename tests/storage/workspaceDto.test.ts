import { describe, expect, it } from "vitest";
import { createInitialWorkspaceData } from "../../src/workspace/model/workspaceData";
import {
  parseRepositoryInfoDto,
  parseWorkspaceDataDto,
  parseWorkspaceSyntaxFileDto,
} from "../../src/storage/workspaceDto";

describe("workspace storage DTOs", () => {
  it("parses current workspace and syntax responses", () => {
    const workspace = createInitialWorkspaceData();
    const source = 'name = "默认 CTN 语法"\n';

    expect(parseWorkspaceDataDto(workspace)).toEqual(workspace);
    expect(parseWorkspaceSyntaxFileDto(null)).toBeNull();
    expect(
      parseWorkspaceSyntaxFileDto({
        fileName: "workspace.toml",
        source,
      }),
    ).toEqual({
      fileName: "workspace.toml",
      source,
    });
    expect(parseRepositoryInfoDto({ path: "/data/repository" })).toEqual({
      path: "/data/repository",
    });
  });

  it("rejects runtime and unsupported fields", () => {
    expect(() =>
      parseWorkspaceDataDto({
        ...createInitialWorkspaceData(),
        syntaxProfile: {},
      }),
    ).toThrow("unsupported field");
    expect(() =>
      parseRepositoryInfoDto({
        path: "/data/repository",
        extra: true,
      }),
    ).toThrow("unsupported field");
    expect(() =>
      parseWorkspaceSyntaxFileDto({
        fileName: "workspace.toml",
        profile: {},
        source: 'name = "默认 CTN 语法"\n',
      }),
    ).toThrow("unsupported field");
  });

  it("does not validate workspace syntax semantics", () => {
    expect(
      parseWorkspaceSyntaxFileDto({
        fileName: "workspace.toml",
        source: 'name = "broken"\n',
      }),
    ).toEqual({
      fileName: "workspace.toml",
      source: 'name = "broken"\n',
    });
  });
});
