import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  clearRepositoryCreateFormAfterSuccess,
  createRepositoryCreateFormDraft,
  createRepositoryRequest,
  RepositoryCreateForm,
  repositoryPasswordInputAttributes,
} from "../../../../presentation/ui/RepositoryCreateForm";
import {
  canDeleteManagedRepositoryData,
  getRepositoryDeletionChoices,
  RepositoryDeleteConfirmation,
} from "../../../../presentation/activities/repository/RepositoryDeleteConfirmation";
import {
  RepositoryContext,
} from "../../../../presentation/activities/repository/RepositoryContext";
import { RepositoryPanel } from "../../../../presentation/activities/repository/RepositoryPanel";
import { copyRepositoryLocation } from "../../../../presentation/activities/repository/repositoryViewHelpers";
import { FeedbackProvider } from "../../../../presentation/ui/shared/FeedbackProvider";
import {
  projectRepositoryIssues,
  type RepositoryOption,
} from "../../../../application/repository/ordinaryRepositoryViewModel";
import { createRepositoryView } from "../../fixtures/repositoryViewFixture";
import { expectMarkupSemantics } from "../../markupSemantics";

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

    expectMarkupSemantics(markup, {
      has: ["存储：本地", "名称"],
      lacks: ['aria-label="仓库存储类型"', "仓库 ID"],
    });
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

    expectMarkupSemantics(markup, {
      has: [
        "地址", 'type="url"', 'autoComplete="url"',
        '<option value="none" selected="">无认证</option>',
        '<option value="basic">Basic</option>',
        'type="submit"', "添加连接",
      ],
      lacks: ["仓库 ID"],
    });
  });
});

describe("repository inline deletion confirmation", () => {
  it("offers both WebDAV deletion modes and requires an exact label for remote deletion", () => {
    const markup = renderToStaticMarkup(
      <RepositoryDeleteConfirmation
        repository={webDavRepository}
        warning="仍有内容等待同步。"
        onCancel={() => undefined}
        onDelete={async () => true}
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
    expectMarkupSemantics(markup, {
      has: [
        'role="group"', "仅移除连接", "删除远端数据",
        "删除远端数据前请输入仓库名称", "仍有内容等待同步。", 'value=""',
        /<button[^>]*disabled=""[^>]*>删除远端数据<\/button>/,
      ],
      lacks: ['role="alertdialog"'],
    });
  });

  it("uses only managed-data deletion for Local repositories", () => {
    const markup = renderToStaticMarkup(
      <RepositoryDeleteConfirmation
        repository={localRepository}
        warning=""
        onCancel={() => undefined}
        onDelete={async () => true}
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
    expectMarkupSemantics(markup, {
      has: [
        "永久删除", "永久删除前请输入仓库名称", 'value=""',
        /<button[^>]*disabled=""[^>]*>永久删除<\/button>/,
      ],
      lacks: ["仅移除连接", "删除远端数据前请输入仓库名称"],
    });
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
    const baseView = createRepositoryView();
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

    expectMarkupSemantics(markup, {
      has: [
        'aria-current="page"', "本地笔记 · 本地", "远端笔记 · WebDAV",
        "仓库 ID", webDavRepository.id,
        'aria-label="重命名仓库 远端笔记"',
        'aria-label="打开仓库 远端笔记"',
        'aria-label="当前仓库"', "未打开", "WebDAV 地址",
        'aria-label="复制WebDAV 地址"', "危险区", "删除仓库",
      ],
      lacks: [
        "<dt>名称</dt>", "新仓库 ID",
        'aria-label="重命名仓库 本地笔记"',
        ">当前</span>", ">打开此仓库<", ">新建仓库</span>",
      ],
      ordered: [
        ">内置数据</span>", ">本地</span>", "本地笔记 · 本地",
        'aria-label="新建仓库"', ">WebDAV</span>",
      ],
    });
    expect(markup.match(/aria-label="新建仓库"/g) ?? []).toHaveLength(1);
    expect(markup.match(/data-repository-catalog="true"/g) ?? [])
      .toHaveLength(1);
  });

  it("keeps creation and manual Local recovery as selectable right-side details", () => {
    const baseView = createRepositoryView();
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

    expectMarkupSemantics(contextMarkup, {
      has: [
        ">本地</span>", 'aria-label="新建仓库"',
        'data-repository-catalog="true"',
        'data-repository-issue-id="default"',
      ],
      lacks: [">新建仓库</span>", "手工删除", "主机路径"],
      ordered: [
        ">本地</span>", 'data-repository-issue-id="default"',
        'aria-label="新建仓库"',
      ],
    });
    expectMarkupSemantics(issueMarkup, {
      has: [
        "仓库格式不受支持，需要手工删除该目录。",
        "请在文件系统中手工删除上述目录。",
        "/home/zisu/notes/default", 'aria-label="复制主机路径"', ">重新检查<",
      ],
      lacks: ["/data/repositories/default", ">清理<", "危险区"],
    });
    expectMarkupSemantics(createMarkup, {
      has: [
        "新建普通仓库", 'aria-label="仓库存储类型"', 'type="submit"',
      ],
    });
  });

  it("shows ordinary catalog recovery only in the selected create detail", () => {
    const view = {
      ...createRepositoryView(),
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

    expectMarkupSemantics(contextMarkup, {
      has: [
        ">本地</span>", 'aria-label="新建仓库"',
        'data-repository-catalog="true"', "disabled=\"\"",
      ],
      lacks: [">新建仓库</span>", "无法读取普通仓库目录。"],
    });
    expectMarkupSemantics(detailMarkup, {
      has: ["无法读取普通仓库目录。", ">重试普通仓库<"],
    });
  });

  it("keeps issue rows compact and moves every cleanup action to the selected detail", () => {
    const baseView = createRepositoryView();
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

    expectMarkupSemantics(contextMarkup, {
      has: [
        'data-repository-issue-id="webdav-broken"',
        'data-repository-issue-id="webdav-deleting"',
        'data-repository-issue-id="local-broken"',
      ],
      lacks: [">移除连接<", ">重试清理<", ">停止跟踪<", ">清理<"],
    });
    expectMarkupSemantics(panelMarkup, {
      has: ["webdav-deleting", ">重试清理<", ">停止跟踪<"],
      lacks: ["webdav-broken", "local-broken"],
    });
  });

  it("keeps protected built-in rows minimal and shows location and recovery in the detail", () => {
    const baseView = createRepositoryView();
    const view = {
      ...baseView,
      repositories: [{ ...localRepository, labelIssue: "conflict" as const }],
      builtInIssues: [{
        code: "repository_corrupt" as const,
        displayLabel: "代办 · 内置数据",
        id: "todo" as const,
        label: "代办" as const,
        location: {
          serverPath: "/state/built-ins/todo/content.json",
          type: "server" as const,
        },
        locationRows: [{
          copyValue: "/state/built-ins/todo/content.json",
          label: "服务端路径",
          value: "/state/built-ins/todo/content.json",
        }],
        message: "代办数据损坏。",
        status: "fault" as const,
      }],
      builtIns: [{
        conflictResolution: {
          keepLocal: async () => undefined,
          loadUnitIds: async () => ["journal:entry:entry-1"],
          recoverLocalCopy: async () => undefined,
          useRemote: async () => undefined,
        },
        errorMessage: "日记仓库存在同步冲突。",
        hasProblem: true,
        id: "journal" as const,
        label: "日记" as const,
        location: {
          serverPath: "/state/built-ins/journal/content.json",
          type: "server" as const,
        },
        locationRows: [{
          copyValue: "/state/built-ins/journal/content.json",
          label: "服务端路径",
          value: "/state/built-ins/journal/content.json",
        }],
        protected: true as const,
        recoveryAction: null,
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
            id: "journal",
            kind: "built-in",
          }}
          view={view}
        />
      </FeedbackProvider>,
    );
    const journalMarkup = renderToStaticMarkup(
      <FeedbackProvider>
        <RepositoryPanel
          selection={{
            id: "journal",
            kind: "built-in",
          }}
          view={view}
        />
      </FeedbackProvider>,
    );
    const todoMarkup = renderToStaticMarkup(
      <FeedbackProvider>
        <RepositoryPanel
          selection={{ id: "todo", kind: "built-in" }}
          view={view}
        />
      </FeedbackProvider>,
    );

    expectMarkupSemantics(contextMarkup, {
      has: [
        ">内置数据</span>", 'data-built-in-id="journal"',
        'data-built-in-id="todo"', "同步冲突",
      ],
      lacks: [
        "/state/built-ins/journal/content.json",
        "/state/built-ins/todo/content.json", "放弃本地修改并重新加载",
      ],
    });
    expectMarkupSemantics(journalMarkup, {
      has: [
        "受保护内置数据", "/state/built-ins/journal/content.json",
        "以当前远端版本保留本地", "采用远端",
        "采用远端并另存本地正文",
      ],
      lacks: ["删除仓库", "重命名仓库", "放弃本地修改并重新加载"],
    });
    expectMarkupSemantics(todoMarkup, {
      has: [
        "代办数据损坏。",
        "/state/built-ins/todo/content.json",
        ">重试<",
      ],
    });
  });

  it("offers built-in catalog retry only in the selected built-in detail", () => {
    const view = {
      ...createRepositoryView(),
      builtInCatalogErrorMessage: "内置数据目录不可用。",
      builtInCatalogStatus: "failed" as const,
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
            id: "journal",
            kind: "built-in",
          }}
          view={view}
        />
      </FeedbackProvider>,
    );

    expectMarkupSemantics(contextMarkup, {
      has: [
        'aria-label="日记数据存在问题"', 'aria-label="代办数据存在问题"',
      ],
      lacks: ['role="alert"', "内置数据目录不可用。", ">重试内置数据<"],
    });
    expect(contextMarkup.match(/>故障<\/span>/g)).toHaveLength(2);
    expectMarkupSemantics(panelMarkup, {
      has: ["内置数据目录不可用。", ">重试内置数据<"],
    });
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
      ...createRepositoryView(),
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
      ...createRepositoryView(),
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

    expectMarkupSemantics(contextMarkup, {
      has: ['aria-label="仓库运行状态存在问题"'],
      lacks: ["无法读取仓库索引。"],
    });
    expectMarkupSemantics(activeMarkup, {
      has: ["无法读取仓库索引。", ">重试挂载<"],
      lacks: [">重新扫描文件<"],
    });
    expectMarkupSemantics(inactiveMarkup, {
      has: [">重新检查仓库<"],
      lacks: ["无法读取仓库索引。"],
    });
  });
});
