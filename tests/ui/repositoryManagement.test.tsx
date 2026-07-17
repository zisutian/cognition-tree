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
} from "../../src/ui/activities/settings/RepositoryDeleteDialog";
import { SettingsPanel } from "../../src/ui/activities/settings/SettingsPanel";
import { FeedbackProvider } from "../../src/ui/shared/FeedbackProvider";
import type { RepositoryOption } from "../../src/application/workspace/activities/settings/settingsViewModel";
import { createView } from "./viewFactory";

const localRepository: RepositoryOption = {
  adapter: "local",
  adapterLabel: "本地",
  displayLabel: "本地笔记 · 本地",
  id: "repository-local",
  label: "本地笔记",
  locationLabel: "本地仓库",
};

const webDavRepository: RepositoryOption = {
  adapter: "webdav",
  adapterLabel: "WebDAV",
  displayLabel: "远端笔记 · WebDAV",
  id: "repository-webdav",
  label: "远端笔记",
  locationLabel: "WebDAV · dav.example",
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
        requiresLabelConfirmation: false,
      },
    ]);
    expect(markup).toContain("永久删除");
    expect(markup).not.toContain("仅移除连接");
    expect(markup).not.toContain("删除远端数据前请输入仓库名称");
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

describe("repository setup and settings semantics", () => {
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
            locationLabel: "WebDAV 连接",
            message: "连接配置损坏。",
            status: "fault",
          },
        ]}
        operation="idle"
        onCreate={async () => undefined}
        onDelete={async () => ({ status: "deleted" })}
      />,
    );

    expect(markup).toContain('aria-label="创建仓库"');
    expect(markup).toContain("本机仓库");
    expect(markup).toContain("仓库问题");
    expect(markup).toContain("repository-broken · WebDAV");
    expect(markup).toContain("连接配置损坏。");
    expect(markup).toContain(">清理<");
    expect(markup).not.toContain("仓库 ID");
    expect(markup).not.toContain('aria-label="仓库存储类型"');
  });

  it("groups Settings repositories by adapter and keeps generated IDs read-only", () => {
    const baseView = createView().settings;
    const markup = renderToStaticMarkup(
      <FeedbackProvider>
        <SettingsPanel
          view={{
            ...baseView,
            activeRepositoryId: localRepository.id,
            activeRepositoryLabel: localRepository.label,
            repositories: [localRepository, webDavRepository],
          }}
          workbench={{
            contextWidth: 280,
            onContextWidthChange: () => undefined,
          }}
        />
      </FeedbackProvider>,
    );

    expect(markup).toContain('<optgroup label="本地">');
    expect(markup).toContain('<optgroup label="WebDAV">');
    expect(markup).toContain("本地笔记 · 本地");
    expect(markup).toContain("远端笔记 · WebDAV");
    expect(markup).toContain("仓库 ID");
    expect(markup).toContain(localRepository.id);
    expect(markup).not.toContain("新仓库 ID");
    expect(markup).toContain('aria-label="仓库存储类型"');
  });
});
