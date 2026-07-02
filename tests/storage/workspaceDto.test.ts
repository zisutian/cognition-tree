import { describe, expect, it } from "vitest";
import { createInitialWorkspaceData } from "../../src/domain/notes";
import {
  parseRepositoryInfoDto,
  parseWorkspaceDataDto,
  parseWorkspaceSyntaxFileDto,
} from "../../src/storage/workspaceDto";
import { formatSyntaxProfileToml } from "../../src/syntax/profileToml";

describe("workspace storage DTOs", () => {
  it("parses current workspace and syntax responses", () => {
    const workspace = createInitialWorkspaceData();
    const source = formatSyntaxProfileToml();

    expect(parseWorkspaceDataDto(workspace)).toEqual(workspace);
    expect(
      parseWorkspaceSyntaxFileDto({
        fileName: "workspace.toml",
        source,
      }),
    ).toMatchObject({
      fileName: "workspace.toml",
      profile: {
        id: "ctn-default",
      },
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
        source: formatSyntaxProfileToml(),
      }),
    ).toThrow("unsupported field");
  });

  it("rejects invalid workspace syntax source", () => {
    expect(() =>
      parseWorkspaceSyntaxFileDto({
        fileName: "workspace.toml",
        source: 'id = "broken"\n',
      }),
    ).toThrow("Invalid workspace syntax response");
  });
});
