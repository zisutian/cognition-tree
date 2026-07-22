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
  labelIssue: null,
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
  labelIssue: null,
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

  it("orders compact rows and renders actions only for the selected repository", () => {
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
          selection={{
            id: webDavRepository.id,
            kind: "ordinary-repository",
          }}
          view={view}
        />
        <RepositoryPanel
          selection={{
            id: webDavRepository.id,
            kind: "ordinary-repository",
          }}
          view={view}
        />
      </FeedbackProvider>,
    );

    expect(markup).toContain("ui-compact-context-group-title");
    expect(markup).toContain("ui-compact-context-row-frame");
    expect(markup).toContain("repository-list");
    expect(markup.indexOf(">内置</span>")).toBeLessThan(
      markup.indexOf(">新建仓库</span>"),
    );
    expect(markup.indexOf(">新建仓库</span>")).toBeLessThan(
      markup.indexOf(">本地</span>"),
    );
    expect(markup.indexOf(">本地</span>")).toBeLessThan(
      markup.indexOf(">WebDAV</span>"),
    );
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain("本地笔记 · 本地");
    expect(markup).toContain("远端笔记 · WebDAV");
    expect(markup).toContain("仓库 ID");
    expect(markup).toContain(webDavRepository.id);
    expect(markup).not.toContain("新仓库 ID");
    expect(markup).toContain('aria-label="重命名仓库 远端笔记"');
    expect(markup).toContain('aria-label="打开仓库 远端笔记"');
    expect(markup).not.toContain('aria-label="重命名仓库 本地笔记"');
    expect(markup).toContain(">当前</span>");
    expect(markup).toContain("未打开");
    expect(markup).toContain("WebDAV 地址");
    expect(markup).toContain('aria-label="复制WebDAV 地址"');
    expect(markup).not.toContain(">打开此仓库<");
    expect(markup).toContain("危险区");
    expect(markup).toContain("删除仓库");
  });

  it("keeps creation and manual Local recovery as selectable right-side details", () => {
    const baseView = createView().repository;
    const view = {
      ...baseView,
      activeRepositoryId: null,
      activeRepositoryLabel: "尚未选择普通仓库",
      issues: projectRepositoryIssues([{
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
      }]),
      persistenceStatusLabel: "未挂载",
      repositories: [],
    };
    const contextMarkup = renderToStaticMarkup(
      <FeedbackProvider>
        <RepositoryContext
          focusRequest={null}
          onConsumeFocusRequest={() => undefined}
          selection={{ id: "default", kind: "ordinary-issue" }}
          view={view}
        />
      </FeedbackProvider>,
    );
    const issueMarkup = renderToStaticMarkup(
      <FeedbackProvider>
        <RepositoryPanel
          selection={{ id: "default", kind: "ordinary-issue" }}
          view={view}
        />
      </FeedbackProvider>,
    );
    const createMarkup = renderToStaticMarkup(
      <FeedbackProvider>
        <RepositoryPanel selection={{ kind: "create" }} view={view} />
      </FeedbackProvider>,
    );

    expect(contextMarkup).toContain(">新建仓库</span>");
    expect(contextMarkup).toContain('data-repository-catalog="true"');
    expect(contextMarkup).toContain('data-repository-issue-id="default"');
    expect(contextMarkup).not.toContain("手工删除");
    expect(contextMarkup).not.toContain("主机路径");
    expect(issueMarkup).toContain("仓库格式不受支持，需要手工删除该目录。");
    expect(issueMarkup).toContain("请在文件系统中手工删除上述目录。");
    expect(issueMarkup).toContain("/home/zisu/notes/default");
    expect(issueMarkup).toContain('aria-label="复制主机路径"');
    expect(issueMarkup).toContain(">重新检查<");
    expect(issueMarkup).not.toContain("/data/repositories/default");
    expect(issueMarkup).not.toContain(">清理<");
    expect(issueMarkup).not.toContain("危险区");
    expect(createMarkup).toContain("新建普通仓库");
    expect(createMarkup).toContain('aria-label="仓库存储类型"');
    expect(createMarkup).toContain('type="submit"');
  });

  it("shows ordinary catalog recovery only in the selected create detail", () => {
    const view = {
      ...createView().repository,
      catalogErrorMessage: "无法读取普通仓库目录。",
      catalogStatus: "failed" as const,
      creatableAdapters: [],
      repositories: [],
    };
    const contextMarkup = renderToStaticMarkup(
      <FeedbackProvider>
        <RepositoryContext
          focusRequest={null}
          onConsumeFocusRequest={() => undefined}
          selection={{ kind: "create" }}
          view={view}
        />
      </FeedbackProvider>,
    );
    const detailMarkup = renderToStaticMarkup(
      <FeedbackProvider>
        <RepositoryPanel selection={{ kind: "create" }} view={view} />
      </FeedbackProvider>,
    );

    expect(contextMarkup).toContain('data-repository-catalog="true"');
    expect(contextMarkup).not.toContain("无法读取普通仓库目录。");
    expect(detailMarkup).toContain("无法读取普通仓库目录。");
    expect(detailMarkup).toContain(">重试普通仓库<");
  });

  it("keeps issue rows compact and moves every cleanup action to the selected detail", () => {
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
          selection={{ id: "webdav-deleting", kind: "ordinary-issue" }}
          view={view}
        />
      </FeedbackProvider>,
    );
    const panelMarkup = renderToStaticMarkup(
      <FeedbackProvider>
        <RepositoryPanel
          selection={{ id: "webdav-deleting", kind: "ordinary-issue" }}
          view={view}
        />
      </FeedbackProvider>,
    );

    expect(contextMarkup).toContain('data-repository-issue-id="webdav-broken"');
    expect(contextMarkup).toContain('data-repository-issue-id="webdav-deleting"');
    expect(contextMarkup).toContain('data-repository-issue-id="local-broken"');
    expect(contextMarkup).not.toContain(">移除连接<");
    expect(contextMarkup).not.toContain(">重试清理<");
    expect(contextMarkup).not.toContain(">停止跟踪<");
    expect(contextMarkup).not.toContain(">清理<");
    expect(panelMarkup).toContain("webdav-deleting");
    expect(panelMarkup).toContain(">重试清理<");
    expect(panelMarkup).toContain(">停止跟踪<");
    expect(panelMarkup).not.toContain("webdav-broken");
    expect(panelMarkup).not.toContain("local-broken");
  });

  it("keeps protected system rows minimal and shows location and recovery in the detail", () => {
    const baseView = createView().repository;
    const view = {
      ...baseView,
      repositories: [{ ...localRepository, labelIssue: "conflict" as const }],
      systemIssues: [{
        code: "repository_corrupt" as const,
        displayLabel: "代办 · 内置仓库",
        id: "system-todo" as const,
        label: "代办" as const,
        location: {
          databaseName: "cognition-tree-system-todo",
          type: "browser" as const,
        },
        locationRows: [{
          copyValue: "cognition-tree-system-todo",
          label: "浏览器数据库",
          value: "cognition-tree-system-todo",
        }],
        message: "代办仓库损坏。",
        status: "fault" as const,
      }],
      systemRepositories: [{
        errorMessage: "日记仓库存在同步冲突。",
        hasProblem: true,
        id: "system-journal" as const,
        label: "日记" as const,
        location: {
          serverPath: "/state/system-journal.json",
          type: "server" as const,
        },
        locationRows: [{
          copyValue: "/state/system-journal.json",
          label: "服务端路径",
          value: "/state/system-journal.json",
        }],
        protected: true as const,
        recoveryAction: {
          label: "放弃本地修改并重新加载",
          run: async () => undefined,
        },
        reload: async () => undefined,
        sessionStatus: "ready" as const,
        statusLabel: "同步冲突",
      }],
    };
    const contextMarkup = renderToStaticMarkup(
      <FeedbackProvider>
        <RepositoryContext
          focusRequest={null}
          onConsumeFocusRequest={() => undefined}
          selection={{
            id: "system-journal",
            kind: "system-repository",
          }}
          view={view}
        />
      </FeedbackProvider>,
    );
    const journalMarkup = renderToStaticMarkup(
      <FeedbackProvider>
        <RepositoryPanel
          selection={{
            id: "system-journal",
            kind: "system-repository",
          }}
          view={view}
        />
      </FeedbackProvider>,
    );
    const todoMarkup = renderToStaticMarkup(
      <FeedbackProvider>
        <RepositoryPanel
          selection={{ id: "system-todo", kind: "system-repository" }}
          view={view}
        />
      </FeedbackProvider>,
    );

    expect(contextMarkup).toContain(">内置</span>");
    expect(contextMarkup).toContain('data-system-repository-id="system-journal"');
    expect(contextMarkup).toContain('data-system-repository-id="system-todo"');
    expect(contextMarkup).toContain("同步冲突");
    expect(contextMarkup).not.toContain("/state/system-journal.json");
    expect(contextMarkup).not.toContain("cognition-tree-system-todo");
    expect(contextMarkup).not.toContain("放弃本地修改并重新加载");
    expect(journalMarkup).toContain("内置受保护仓库");
    expect(journalMarkup).toContain("/state/system-journal.json");
    expect(journalMarkup).toContain("放弃本地修改并重新加载");
    expect(todoMarkup).toContain("代办仓库损坏。");
    expect(todoMarkup).toContain("cognition-tree-system-todo");
    expect(todoMarkup).toContain(">重试<");
    expect(journalMarkup).not.toContain("删除仓库");
    expect(journalMarkup).not.toContain("重命名仓库");
  });

  it("offers system catalog retry only in the selected system detail", () => {
    const view = {
      ...createView().repository,
      systemCatalogErrorMessage: "内置仓库目录不可用。",
      systemCatalogStatus: "failed" as const,
    };
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
          selection={{
            id: "system-journal",
            kind: "system-repository",
          }}
          view={view}
        />
      </FeedbackProvider>,
    );

    expect(contextMarkup).not.toContain('role="alert"');
    expect(contextMarkup).not.toContain("内置仓库目录不可用。");
    expect(contextMarkup).not.toContain(">重试内置仓库<");
    expect(contextMarkup.match(/>故障<\/span>/g)).toHaveLength(2);
    expect(contextMarkup.match(/has-diagnostics/g)).toHaveLength(2);
    expect(contextMarkup).toContain('aria-label="日记仓库存在问题"');
    expect(contextMarkup).toContain('aria-label="代办仓库存在问题"');
    expect(panelMarkup).toContain("内置仓库目录不可用。");
    expect(panelMarkup).toContain(">重试内置仓库<");
  });

  it.each([
    ["conflict", "仓库名称与其他仓库冲突，请在左侧重命名。"],
    ["reserved", "仓库名称由内置仓库保留，请在左侧重命名。"],
    ["nonportable", "仓库名称包含不可移植字符，请在左侧重命名。"],
  ] as const)("shows the %s repository label issue in the selected detail", (
    labelIssue,
    message,
  ) => {
    const view = {
      ...createView().repository,
      repositories: [{ ...localRepository, labelIssue }],
    };
    const markup = renderToStaticMarkup(
      <FeedbackProvider>
        <RepositoryPanel
          selection={{
            id: localRepository.id,
            kind: "ordinary-repository",
          }}
          view={view}
        />
      </FeedbackProvider>,
    );

    expect(markup).toContain(message);
  });

  it("keeps ordinary runtime failures compact on the left and recoverable on the right", () => {
    const view = {
      ...createView().repository,
      activeRepositoryId: localRepository.id,
      activeRepositoryLabel: localRepository.label,
      activeSessionErrorMessage: "无法读取仓库索引。",
      activeSessionRecoveryAction: {
        label: "重试挂载",
        run: async () => undefined,
      },
      persistenceStatusLabel: "挂载失败",
      repositories: [localRepository, webDavRepository],
    };
    const contextMarkup = renderToStaticMarkup(
      <FeedbackProvider>
        <RepositoryContext
          focusRequest={null}
          onConsumeFocusRequest={() => undefined}
          selection={{
            id: localRepository.id,
            kind: "ordinary-repository",
          }}
          view={view}
        />
      </FeedbackProvider>,
    );
    const activeMarkup = renderToStaticMarkup(
      <FeedbackProvider>
        <RepositoryPanel
          selection={{
            id: localRepository.id,
            kind: "ordinary-repository",
          }}
          view={view}
        />
      </FeedbackProvider>,
    );
    const inactiveMarkup = renderToStaticMarkup(
      <FeedbackProvider>
        <RepositoryPanel
          selection={{
            id: webDavRepository.id,
            kind: "ordinary-repository",
          }}
          view={view}
        />
      </FeedbackProvider>,
    );

    expect(contextMarkup).toContain('aria-label="仓库运行状态存在问题"');
    expect(contextMarkup).not.toContain("无法读取仓库索引。");
    expect(activeMarkup).toContain("无法读取仓库索引。");
    expect(activeMarkup).toContain(">重试挂载<");
    expect(activeMarkup).not.toContain(">重新扫描文件<");
    expect(inactiveMarkup).not.toContain("无法读取仓库索引。");
    expect(inactiveMarkup).toContain(">重新检查仓库<");
  });
});
