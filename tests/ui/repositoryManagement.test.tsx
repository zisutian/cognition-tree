import { isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  clearRepositoryCreateFormAfterSuccess,
  createRepositoryCreateFormDraft,
  createRepositoryRequest,
  RepositoryCreateForm,
  repositoryPasswordInputAttributes,
} from "../../src/ui/RepositoryCreateForm";
import { RepositorySetupView } from "../../src/ui/RepositorySetupView";
import {
  canDeleteManagedRepositoryData,
  getRepositoryDeletionChoices,
  RepositoryDeleteDialog,
} from "../../src/ui/activities/repository/RepositoryDeleteDialog";
import {
  copyRepositoryLocation,
  RepositoryContext,
  RepositoryPanel,
} from "../../src/ui/activities/repository/RepositoryPanel";
import { FeedbackProvider } from "../../src/ui/shared/FeedbackProvider";
import {
  projectRepositoryIssues,
  type RepositoryOption,
} from "../../src/application/workspace/activities/repository/repositoryViewModel";
import { createView } from "./viewFactory";

const localRepository: RepositoryOption = {
  adapter: "local",
  adapterLabel: "本地",
  displayLabel: "本地笔记 · 本地",
  id: "repository-local",
  label: "本地笔记",
  location: {
    hostPath: "/home/zisu/notes/local",
    serverPath: "/data/repositories/local",
    type: "local",
  },
  locationRows: [
    {
      copyValue: "/home/zisu/notes/local",
      label: "主机路径",
      value: "/home/zisu/notes/local",
    },
    {
      copyValue: "/data/repositories/local",
      label: "服务端路径",
      value: "/data/repositories/local",
    },
  ],
};

const webDavRepository: RepositoryOption = {
  adapter: "webdav",
  adapterLabel: "WebDAV",
  displayLabel: "远端笔记 · WebDAV",
  id: "repository-webdav",
  label: "远端笔记",
  location: {
    type: "webdav",
    url: "https://dav.example/notes/",
  },
  locationRows: [{
    copyValue: "https://dav.example/notes/",
    label: "WebDAV 地址",
    value: "https://dav.example/notes/",
  }],
};

describe("repository creation form", () => {
  it("does not expose a manual repository ID and hides a redundant adapter selector", () => {
    const markup = renderToStaticMarkup(
      <RepositoryCreateForm
        adapters={[{ label: "本地", value: "local" }]}
        onCreate={async () => undefined}
      />,
    );

    expect(markup).toContain("存储：本地");
    expect(markup).toContain("名称");
    expect(markup).not.toContain('aria-label="仓库存储类型"');
    expect(markup).not.toContain("仓库 ID");
    expect(markup.match(/<input/g) ?? []).toHaveLength(1);
    expect(createRepositoryRequest("local", {
      ...createRepositoryCreateFormDraft(),
      name: "  我的仓库  ",
    })).toEqual({ adapter: "local", name: "我的仓库" });
  });

  it("builds Basic credentials without normalizing the password and clears fields after success", () => {
    const draft = {
      authenticationType: "basic" as const,
      name: "  远端笔记  ",
      password: "  keep surrounding whitespace  ",
      url: "  https://dav.example/notes/  ",
      username: "  owner  ",
    };

    expect(createRepositoryRequest("webdav", draft)).toEqual({
      adapter: "webdav",
      authentication: {
        password: "  keep surrounding whitespace  ",
        type: "basic",
        username: "owner",
      },
      name: "远端笔记",
      url: "https://dav.example/notes/",
    });
    expect(repositoryPasswordInputAttributes).toEqual({
      autoComplete: "new-password",
      maxLength: 4_096,
      type: "password",
    });
    expect(clearRepositoryCreateFormAfterSuccess(draft)).toEqual({
      authenticationType: "basic",
      name: "",
      password: "",
      url: "",
      username: "",
    });
  });

  it("renders the WebDAV connection and authentication choices with form semantics", () => {
    const markup = renderToStaticMarkup(
      <RepositoryCreateForm
        adapters={[{ label: "WebDAV", value: "webdav" }]}
        onCreate={async () => undefined}
      />,
    );

    expect(markup).toContain("地址");
    expect(markup).toContain('type="url"');
    expect(markup).toContain('autoComplete="url"');
    expect(markup).toContain('<option value="none" selected="">无认证</option>');
    expect(markup).toContain('<option value="basic">Basic</option>');
    expect(markup).toContain('type="submit"');
    expect(markup).toContain("添加连接");
    expect(markup).not.toContain("仓库 ID");
  });
});

describe("repository deletion dialog", () => {
  it("offers both WebDAV deletion modes and requires an exact label for remote deletion", () => {
    const markup = renderToStaticMarkup(
      <RepositoryDeleteDialog
        repository={webDavRepository}
        warning="仍有内容等待同步。"
        onClose={() => undefined}
        onDelete={async () => undefined}
      />,
    );

    expect(getRepositoryDeletionChoices(webDavRepository)).toEqual([
      {
        label: "仅移除连接",
        mode: "remove-connection",
        requiresLabelConfirmation: false,
      },
      {
        label: "删除远端数据",
        mode: "delete-managed-data",
        requiresLabelConfirmation: true,
      },
    ]);
    expect(canDeleteManagedRepositoryData(webDavRepository, "远端笔记")).toBe(true);
    expect(canDeleteManagedRepositoryData(webDavRepository, " 远端笔记")).toBe(false);
    expect(canDeleteManagedRepositoryData(webDavRepository, "远端笔记 ")).toBe(false);
    expect(markup).toContain('role="alertdialog"');
    expect(markup).toContain("仅移除连接");
    expect(markup).toContain("删除远端数据");
    expect(markup).toContain("删除远端数据前请输入仓库名称");
    expect(markup).toContain("仍有内容等待同步。");
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>删除远端数据<\/button>/);
  });

  it("uses only managed-data deletion for Local repositories", () => {
    const markup = renderToStaticMarkup(
      <RepositoryDeleteDialog
        repository={localRepository}
        warning=""
        onClose={() => undefined}
        onDelete={async () => undefined}
      />,
    );

    expect(getRepositoryDeletionChoices(localRepository)).toEqual([
      {
        label: "永久删除",
        mode: "delete-managed-data",
        requiresLabelConfirmation: true,
      },
    ]);
    expect(canDeleteManagedRepositoryData(localRepository, "本地笔记")).toBe(true);
    expect(canDeleteManagedRepositoryData(localRepository, "本地笔记 ")).toBe(false);
    expect(markup).toContain("永久删除");
    expect(markup).not.toContain("仅移除连接");
    expect(markup).not.toContain("删除远端数据前请输入仓库名称");
    expect(markup).toContain("永久删除前请输入仓库名称");
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>永久删除<\/button>/);
  });

  it("reopens the same WebDAV repository with an empty confirmation state", () => {
    const props = {
      repository: webDavRepository,
      warning: "",
      onClose: () => undefined,
      onDelete: async () => undefined,
    };
    const firstDialogContent = RepositoryDeleteDialog(props);

    expect(isValidElement(firstDialogContent)).toBe(true);
    expect(firstDialogContent?.key).toBe(webDavRepository.id);
    expect(RepositoryDeleteDialog({ ...props, repository: null })).toBeNull();
    const reopenedDialogContent = RepositoryDeleteDialog(props);

    expect(isValidElement(reopenedDialogContent)).toBe(true);
    expect(reopenedDialogContent?.key).toBe(webDavRepository.id);
    expect(reopenedDialogContent?.type).toBe(firstDialogContent?.type);

    const renderDialog = (repository: RepositoryOption | null) =>
      renderToStaticMarkup(
        <RepositoryDeleteDialog
          repository={repository}
          warning=""
          onClose={() => undefined}
          onDelete={async () => undefined}
        />,
      );

    const firstOpen = renderDialog(webDavRepository);

    expect(renderDialog(null)).toBe("");
    const reopened = renderDialog(webDavRepository);

    expect(firstOpen).toContain('value=""');
    expect(reopened).toContain('value=""');
    expect(reopened).toMatch(/<button[^>]*disabled=""[^>]*>删除远端数据<\/button>/);
  });
});

describe("repository setup and management semantics", () => {
  it("copies the exact structured location value", async () => {
    const values: string[] = [];

    await copyRepositoryLocation("/home/zisu/notes/local", {
      async writeText(value) {
        values.push(value);
      },
    });

    expect(values).toEqual(["/home/zisu/notes/local"]);
    await expect(copyRepositoryLocation("ignored", undefined)).rejects.toThrow(
      "不支持复制到剪贴板",
    );
  });

  it("shows catalog issues in Setup without restoring a manual ID field", () => {
    const markup = renderToStaticMarkup(
      <RepositorySetupView
        adapters={[{ label: "本地", value: "local" }]}
        catalogLabel="本机仓库"
        issues={[
          {
            adapter: "webdav",
            adapterLabel: "WebDAV",
            code: "repository_corrupt",
            displayLabel: "repository-broken · WebDAV",
            id: "repository-broken",
            location: null,
            locationRows: [],
            message: "连接配置损坏。",
            status: "fault",
          },
        ]}
        operation="idle"
        onCreate={async () => undefined}
        onDelete={async () => ({ status: "deleted" })}
        onRefresh={async () => undefined}
      />,
    );

    expect(markup).toContain('aria-label="创建仓库"');
    expect(markup).toContain('class="repository-create-form repository-setup-form"');
    expect(markup).toContain("本机仓库");
    expect(markup).toContain("仓库问题");
    expect(markup).toContain("repository-broken · WebDAV");
    expect(markup).toContain("连接配置损坏。");
    expect(markup).toContain(">移除连接<");
    expect(markup).not.toContain("仓库 ID");
    expect(markup).not.toContain('aria-label="仓库存储类型"');
  });

  it("requires manual file-system deletion for an unsupported Local repository", () => {
    const issues = projectRepositoryIssues([{
      adapter: "local",
      code: "unsupported_repository_version",
      id: "default",
      location: {
        hostPath: "/home/zisu/notes/default",
        serverPath: "/data/repositories/default",
        type: "local",
      },
      message: "Repository version is not supported",
      status: "fault",
    }]);
    const markup = renderToStaticMarkup(
      <RepositorySetupView
        adapters={[{ label: "本地", value: "local" }]}
        catalogLabel="本机仓库"
        issues={issues}
        operation="idle"
        onCreate={async () => undefined}
        onDelete={async () => ({ status: "deleted" })}
        onRefresh={async () => undefined}
      />,
    );

    expect(markup).toContain("仓库格式不受支持，需要手工删除该目录。");
    expect(markup).toContain("请在文件系统中手工删除上述目录。");
    expect(markup).toContain("主机路径：/home/zisu/notes/default");
    expect(markup).toContain('aria-label="复制主机路径"');
    expect(markup).toContain(">重新检查<");
    expect(markup).not.toContain("/data/repositories/default");
    expect(markup).not.toContain(">清理<");
    expect(markup).not.toContain(">重试清理<");
    expect(markup).not.toContain(">移除连接<");
  });

  it("uses a grouped repository context and keeps generated IDs read-only", () => {
    const baseView = createView().repository;
    const view = {
      ...baseView,
      activeRepositoryId: localRepository.id,
      activeRepositoryLabel: localRepository.label,
      repositories: [localRepository, webDavRepository],
    };
    const markup = renderToStaticMarkup(
      <FeedbackProvider>
        <RepositoryContext
          focusRequest={null}
          onConsumeFocusRequest={() => undefined}
          view={view}
        />
        <RepositoryPanel
          view={view}
        />
      </FeedbackProvider>,
    );

    expect(markup).toContain("repository-group-title");
    expect(markup).toContain("repository-list");
    expect(markup.indexOf(">本地</span>")).toBeLessThan(
      markup.indexOf(">WebDAV</span>"),
    );
    expect(markup).toContain('aria-current="page"');
    expect(markup).not.toContain("<select");
    expect(markup).toContain("本地笔记 · 本地");
    expect(markup).toContain("远端笔记 · WebDAV");
    expect(markup).toContain("仓库 ID");
    expect(markup).toContain(localRepository.id);
    expect(markup).not.toContain("新仓库 ID");
    expect(markup).not.toContain('aria-label="仓库存储类型"');
    expect(markup).toContain('aria-label="重新扫描文件"');
    expect(markup).toContain('aria-label="添加仓库"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain(
      'class="ui-section repository-create-region"',
    );
    expect(markup).toContain("主机路径");
    expect(markup).toContain("/home/zisu/notes/local");
    expect(markup).toContain('aria-label="复制主机路径"');
    expect(markup).toContain("危险区");
    expect(markup).toContain("删除仓库");
  });

  it("renders repository issues only in the grouped context with focus targets and actions", () => {
    const baseView = createView().repository;
    const issues = projectRepositoryIssues([
      {
        adapter: "webdav",
        code: "repository_corrupt",
        id: "webdav-broken",
        location: null,
        message: "连接配置损坏。",
        status: "fault",
      },
      {
        adapter: "webdav",
        code: "repository_busy",
        id: "webdav-deleting",
        location: null,
        message: "正在删除。",
        status: "deleting",
      },
      {
        adapter: "local",
        code: "repository_corrupt",
        id: "local-broken",
        location: null,
        message: "仓库元数据损坏。",
        status: "fault",
      },
    ]);
    const view = { ...baseView, issues };
    const contextMarkup = renderToStaticMarkup(
      <FeedbackProvider>
        <RepositoryContext
          focusRequest={null}
          onConsumeFocusRequest={() => undefined}
          view={view}
        />
      </FeedbackProvider>,
    );
    const panelMarkup = renderToStaticMarkup(
      <FeedbackProvider>
        <RepositoryPanel
          view={view}
        />
      </FeedbackProvider>,
    );

    expect(contextMarkup).toContain('data-repository-issue-id="webdav-broken"');
    expect(contextMarkup).toContain('data-repository-issue-id="webdav-deleting"');
    expect(contextMarkup).toContain('data-repository-issue-id="local-broken"');
    expect(contextMarkup.match(/tabindex="-1"/g)).toHaveLength(3);
    expect(contextMarkup).toContain(">移除连接<");
    expect(contextMarkup).toContain(">重试清理<");
    expect(contextMarkup).toContain(">停止跟踪<");
    expect(contextMarkup).toContain(">清理<");
    expect(panelMarkup).not.toContain("仓库问题");
    expect(panelMarkup).not.toContain("webdav-broken");
    expect(panelMarkup).not.toContain("local-broken");
  });
});
