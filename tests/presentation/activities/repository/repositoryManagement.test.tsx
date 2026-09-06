import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  clearRepositoryCreateFormAfterSuccess,
  createRepositoryCreateFormDraft,
  createRepositoryRequest,
  RepositoryCreateForm,
} from "../../../../presentation/activities/repository/RepositoryCreateForm";
import {
  canDeleteManagedRepositoryData,
  RepositoryDeleteConfirmation,
} from "../../../../presentation/activities/repository/RepositoryDeleteConfirmation";
import { RepositoryContext } from "../../../../presentation/activities/repository/RepositoryContext";
import { RepositoryPanel } from "../../../../presentation/activities/repository/RepositoryPanel";
import { RepositoryStatusPanel } from "../../../../presentation/activities/repository/RepositoryStatusPanel";
import { copyRepositoryLocation } from "../../../../presentation/activities/repository/repositoryViewHelpers";
import { TestFeedbackProvider as FeedbackProvider } from "../../fixtures/TestFeedbackProvider";
import {
  projectRepositoryIssues,
  type RepositoryOption,
} from "../../../../application/repository/ordinaryRepositoryViewModel";
import { createRepositoryView } from "../../fixtures/repositoryViewFixture";
import { expectMarkupSemantics } from "../../markupSemantics";

const localRepository: RepositoryOption = {
  displayLabel: "本地笔记",
  id: "repository-local",
  label: "本地笔记",
  location: {
    hostPath: "/home/zisu/notes/local",
    serverPath: "/data/repositories/local",
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

const secondaryRepository: RepositoryOption = {
  ...localRepository,
  displayLabel: "第二仓库",
  id: "repository-secondary",
  label: "第二仓库",
  location: {
    hostPath: "/home/zisu/notes/secondary",
    serverPath: "/data/repositories/secondary",
  },
  locationRows: [],
};

describe("repository creation form", () => {
  it("does not expose a manual repository ID and hides a redundant adapter selector", () => {
    const markup = renderToStaticMarkup(
      <RepositoryCreateForm onCreate={async () => undefined} />,
    );

    expectMarkupSemantics(markup, {
      has: ["名称", "创建仓库"],
      lacks: ['aria-label="仓库存储类型"', "仓库 ID"],
    });
    expect(markup.match(/<input/g) ?? []).toHaveLength(1);
    expect(
      createRepositoryRequest({
        ...createRepositoryCreateFormDraft(),
        name: "  我的仓库  ",
      }),
    ).toEqual({ name: "我的仓库" });
  });

  it("clears the only repository field after success", () => {
    expect(clearRepositoryCreateFormAfterSuccess()).toEqual({ name: "" });
  });
});

describe("repository inline deletion confirmation", () => {
  it("requires the exact label for permanent local deletion", () => {
    const markup = renderToStaticMarkup(
      <RepositoryDeleteConfirmation
        repository={localRepository}
        onCancel={() => undefined}
        onDelete={async () => true}
      />,
    );

    expect(canDeleteManagedRepositoryData(localRepository, "本地笔记")).toBe(
      true,
    );
    expect(canDeleteManagedRepositoryData(localRepository, "本地笔记 ")).toBe(
      false,
    );
    expectMarkupSemantics(markup, {
      has: [
        "永久删除",
        "永久删除前请输入仓库名称",
        'value=""',
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
      repositories: [localRepository, secondaryRepository],
    };
    const markup = renderToStaticMarkup(
      <FeedbackProvider>
        <RepositoryContext
          focusRequest={null}
          onConsumeFocusRequest={() => undefined}
          selection={{
            id: secondaryRepository.id,
            kind: "ordinary-repository",
          }}
          view={view}
        />
        <RepositoryPanel
          onOpen={async () => undefined}
          selection={{
            id: secondaryRepository.id,
            kind: "ordinary-repository",
          }}
          view={view}
        />
        <RepositoryStatusPanel
          onCollapseDetail={() => undefined}
          selection={{
            id: secondaryRepository.id,
            kind: "ordinary-repository",
          }}
          view={view}
        />
      </FeedbackProvider>,
    );

    expectMarkupSemantics(markup, {
      has: [
        'aria-current="page"',
        "本地笔记",
        "第二仓库",
        'data-tool-layout="form"',
        'aria-label="仓库状态"',
        "仓库 ID",
        secondaryRepository.id,
        'aria-label="重命名仓库 第二仓库"',
        'aria-label="打开仓库 第二仓库"',
        'aria-label="当前仓库"',
        "未打开",
        "危险区",
        "删除仓库",
      ],
      lacks: [
        "<dt>名称</dt>",
        "新仓库 ID",
        'aria-label="重命名仓库 本地笔记"',
        ">当前</span>",
        ">打开此仓库<",
        ">新建仓库</span>",
      ],
      ordered: [
        ">内置数据</span>",
        ">本地</span>",
        "本地笔记",
        "第二仓库",
        'aria-label="新建仓库"',
      ],
    });
    expect(markup.match(/aria-label="新建仓库"/g) ?? []).toHaveLength(1);
    expect(markup.match(/data-repository-catalog="true"/g) ?? []).toHaveLength(
      1,
    );
  });

  it("removes rescan from a healthy active repository detail", () => {
    const view = {
      ...createRepositoryView(),
      activeRepositoryId: localRepository.id,
      activeRepositoryLabel: localRepository.label,
      repositories: [localRepository],
    };
    const markup = renderToStaticMarkup(
      <FeedbackProvider>
        <RepositoryPanel
          onOpen={async () => undefined}
          selection={{
            id: localRepository.id,
            kind: "ordinary-repository",
          }}
          view={view}
        />
      </FeedbackProvider>,
    );

    expectMarkupSemantics(markup, {
      lacks: ["重新扫描文件", "重新检查仓库", ">操作<"],
    });
  });

  it("keeps creation and manual Local recovery as selectable right-side details", () => {
    const baseView = createRepositoryView();
    const view = {
      ...baseView,
      activeRepositoryId: null,
      activeRepositoryLabel: "尚未选择普通仓库",
      issues: projectRepositoryIssues([
        {
          code: "unsupported_repository_version",
          id: "default",
          location: {
            hostPath: "/home/zisu/notes/default",
            serverPath: "/data/repositories/default",
          },
          message: "Repository version is not supported",
        },
      ]),
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
          onOpen={async () => undefined}
          selection={{ id: "default", kind: "ordinary-issue" }}
          view={view}
        />
        <RepositoryStatusPanel
          onCollapseDetail={() => undefined}
          selection={{ id: "default", kind: "ordinary-issue" }}
          view={view}
        />
      </FeedbackProvider>,
    );
    const createMarkup = renderToStaticMarkup(
      <FeedbackProvider>
        <RepositoryPanel
          onOpen={async () => undefined}
          selection={{ kind: "create" }}
          view={view}
        />
      </FeedbackProvider>,
    );

    expectMarkupSemantics(contextMarkup, {
      has: [
        ">本地</span>",
        'aria-label="新建仓库"',
        'data-repository-catalog="true"',
        'data-repository-issue-id="default"',
      ],
      lacks: [">新建仓库</span>", "手工删除", "主机路径"],
      ordered: [
        ">本地</span>",
        'data-repository-issue-id="default"',
        'aria-label="新建仓库"',
      ],
    });
    expectMarkupSemantics(issueMarkup, {
      has: [
        "仓库格式不受支持，需要手工删除该目录。",
        "请在文件系统中手工删除上述目录。",
        "/home/zisu/notes/default",
        'aria-label="复制主机路径"',
        ">重新检查<",
      ],
      lacks: ["/data/repositories/default", ">清理<", "危险区"],
    });
    expectMarkupSemantics(createMarkup, {
      has: ["新建普通仓库", "名称", 'type="submit"'],
      lacks: ['aria-label="仓库存储类型"'],
    });
  });

  it("shows ordinary catalog recovery only in the selected create detail", () => {
    const view = {
      ...createRepositoryView(),
      catalogErrorMessage: "无法读取普通仓库目录。",
      catalogStatus: "failed" as const,
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
        <RepositoryPanel
          onOpen={async () => undefined}
          selection={{ kind: "create" }}
          view={view}
        />
      </FeedbackProvider>,
    );

    expectMarkupSemantics(contextMarkup, {
      has: [
        ">本地</span>",
        'aria-label="新建仓库"',
        'data-repository-catalog="true"',
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
        code: "repository_corrupt",
        id: "broken-first",
        location: null,
        message: "仓库配置损坏。",
      },
      {
        code: "repository_corrupt",
        id: "broken-second",
        location: null,
        message: "仓库元数据损坏。",
      },
    ]);
    const view = { ...baseView, issues };
    const contextMarkup = renderToStaticMarkup(
      <FeedbackProvider>
        <RepositoryContext
          focusRequest={null}
          onConsumeFocusRequest={() => undefined}
          selection={{ id: "broken-second", kind: "ordinary-issue" }}
          view={view}
        />
      </FeedbackProvider>,
    );
    const panelMarkup = renderToStaticMarkup(
      <FeedbackProvider>
        <RepositoryPanel
          onOpen={async () => undefined}
          selection={{ id: "broken-second", kind: "ordinary-issue" }}
          view={view}
        />
        <RepositoryStatusPanel
          onCollapseDetail={() => undefined}
          selection={{ id: "journal", kind: "built-in" }}
          view={view}
        />
      </FeedbackProvider>,
    );

    expectMarkupSemantics(contextMarkup, {
      has: [
        'data-repository-issue-id="broken-first"',
        'data-repository-issue-id="broken-second"',
      ],
      lacks: [">清理<"],
    });
    expectMarkupSemantics(panelMarkup, {
      has: ["broken-second", ">清理<"],
      lacks: ["broken-first"],
    });
  });

  it("keeps protected built-in rows minimal and shows location and recovery in the detail", () => {
    const baseView = createRepositoryView();
    const view = {
      ...baseView,
      repositories: [{ ...localRepository, labelIssue: "conflict" as const }],
      builtInIssues: [
        {
          code: "repository_corrupt" as const,
          displayLabel: "代办 · 内置数据",
          id: "todo" as const,
          label: "代办" as const,
          location: {
            serverPath: "/state/built-ins/todo/content.json",
            type: "server" as const,
          },
          locationRows: [
            {
              copyValue: "/state/built-ins/todo/content.json",
              label: "服务端路径",
              value: "/state/built-ins/todo/content.json",
            },
          ],
          message: "代办数据损坏。",
          status: "fault" as const,
        },
      ],
      builtIns: [
        {
          conflictResolution: {
            keepLocal: async () => undefined,
            loadDetails: async () => ({
              remoteRevision: `sha256:${"a".repeat(64)}`,
              unitIds: ["journal:entry:entry-1"],
            }),
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
          locationRows: [
            {
              copyValue: "/state/built-ins/journal/content.json",
              label: "服务端路径",
              value: "/state/built-ins/journal/content.json",
            },
          ],
          protected: true as const,
          recoveryAction: null,
          reload: async () => undefined,
          sessionStatus: "ready" as const,
          statusLabel: "同步冲突",
        },
      ],
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
          onOpen={async () => undefined}
          selection={{
            id: "journal",
            kind: "built-in",
          }}
          view={view}
        />
        <RepositoryStatusPanel
          onCollapseDetail={() => undefined}
          selection={{ id: "journal", kind: "built-in" }}
          view={view}
        />
      </FeedbackProvider>,
    );
    const todoMarkup = renderToStaticMarkup(
      <FeedbackProvider>
        <RepositoryPanel
          onOpen={async () => undefined}
          selection={{ id: "todo", kind: "built-in" }}
          view={view}
        />
        <RepositoryStatusPanel
          onCollapseDetail={() => undefined}
          selection={{ id: "todo", kind: "built-in" }}
          view={view}
        />
      </FeedbackProvider>,
    );

    expectMarkupSemantics(contextMarkup, {
      has: [
        ">内置数据</span>",
        'data-built-in-id="journal"',
        'data-built-in-id="todo"',
        "同步冲突",
      ],
      lacks: [
        "/state/built-ins/journal/content.json",
        "/state/built-ins/todo/content.json",
        "放弃本地修改并重新加载",
      ],
    });
    expectMarkupSemantics(journalMarkup, {
      has: [
        "保护",
        "内置数据",
        "/state/built-ins/journal/content.json",
        "保留本地",
        "采用远端",
        "远端并另存本地",
      ],
      lacks: ["删除仓库", "重命名仓库", "放弃本地修改并重新加载"],
    });
    expectMarkupSemantics(todoMarkup, {
      has: ["代办数据损坏。", "/state/built-ins/todo/content.json", ">重试<"],
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
          onOpen={async () => undefined}
          selection={{
            id: "journal",
            kind: "built-in",
          }}
          view={view}
        />
        <RepositoryStatusPanel
          onCollapseDetail={() => undefined}
          selection={{
            id: localRepository.id,
            kind: "ordinary-repository",
          }}
          view={view}
        />
      </FeedbackProvider>,
    );

    expectMarkupSemantics(contextMarkup, {
      has: ['aria-label="日记数据存在问题"', 'aria-label="代办数据存在问题"'],
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
  ] as const)(
    "shows the %s repository label issue in the selected detail",
    (labelIssue, message) => {
      const view = {
        ...createRepositoryView(),
        repositories: [{ ...localRepository, labelIssue }],
      };
      const markup = renderToStaticMarkup(
        <FeedbackProvider>
          <RepositoryPanel
            onOpen={async () => undefined}
            selection={{
              id: localRepository.id,
              kind: "ordinary-repository",
            }}
            view={view}
          />
          <RepositoryStatusPanel
            onCollapseDetail={() => undefined}
            selection={{
              id: localRepository.id,
              kind: "ordinary-repository",
            }}
            view={view}
          />
        </FeedbackProvider>,
      );

      expect(markup).toContain(message);
    },
  );

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
      repositories: [localRepository, secondaryRepository],
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
          onOpen={async () => undefined}
          selection={{
            id: localRepository.id,
            kind: "ordinary-repository",
          }}
          view={view}
        />
        <RepositoryStatusPanel
          onCollapseDetail={() => undefined}
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
          onOpen={async () => undefined}
          selection={{
            id: secondaryRepository.id,
            kind: "ordinary-repository",
          }}
          view={view}
        />
        <RepositoryStatusPanel
          onCollapseDetail={() => undefined}
          selection={{
            id: secondaryRepository.id,
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
