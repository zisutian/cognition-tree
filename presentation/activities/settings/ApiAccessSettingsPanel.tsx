// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from "react";
import {
  Button,
  ConfirmAction,
  EmptyState,
  FormSaveActions,
  ToolPropertyList,
  ToolPropertyRow,
  useFeedback,
} from "../../ui/index.ts";
import {
  apiAccessDraftScopes,
  createApiAccessDraft,
} from "./apiAccessDraft.ts";
import { ApiAccessSettingsForm } from "./ApiAccessSettingsForm.tsx";
import { SettingsPage } from "./SettingsPage.tsx";
import type { SettingsTarget } from "./settingsTypes.ts";
import { useSettingsDraft } from "./useSettingsDraft.ts";
import {
  useSettingsInteraction,
  type SettingsInteractionReporter,
} from "./useSettingsInteraction.ts";
import type { ApiAccessSettingsView } from "./useApiAccessSettingsSession.ts";

export function ApiAccessSettingsPanel({
  onCompleted,
  report,
  session,
  target,
}: {
  onCompleted(target: SettingsTarget): void;
  report: SettingsInteractionReporter;
  session: ApiAccessSettingsView;
  target: Extract<SettingsTarget, { id: string | null }> & {
    kind: "automation" | "trusted";
  };
}) {
  const feedback = useFeedback();
  const [confirming, setConfirming] = useState(false);
  const initial = createApiAccessDraft();
  const draft = useSettingsDraft(initial, {
    revision: "new-token",
    value: initial,
  });
  const [revoking, setRevoking] = useState(false);
  const busy = draft.submitting || revoking || session.snapshot.loading;
  const scopes = apiAccessDraftScopes(draft.draft);
  const creating = target.id === null;
  const automationToken =
    target.kind === "automation"
      ? session.snapshot.tokens.find((item) => item.id === target.id)
      : null;
  const token =
    automationToken ??
    session.snapshot.trustedClientTokens.find((item) => item.id === target.id);
  const title =
    token?.name ??
    (creating
      ? target.kind === "automation"
        ? "新建自动化令牌"
        : "新建可信客户端令牌"
      : "令牌已移除");
  const errorMessage = draft.errorMessage ?? session.snapshot.errorMessage;
  useSettingsInteraction(report, {
    dirty: creating && draft.dirty,
    submitting: draft.submitting || revoking,
    errorMessage,
  });
  const create = () =>
    feedback.runAction(async () => {
      let createdId: string | null = null;
      const receipt = await draft.submit(async (value) => {
        const created =
          target.kind === "automation"
            ? await session.createToken({
                name: value.name.trim(),
                scopes: apiAccessDraftScopes(value),
                repositoryIds:
                  value.permissions.workspace === "none"
                    ? null
                    : value.repositoryIds,
              })
            : await session.createTrustedClientToken(value.name.trim());
        if (!created) throw new Error("未能创建令牌，请查看服务状态。");
        createdId = created.id;
        return { revision: "new-token", value };
      });
      if (receipt && createdId)
        onCompleted({ kind: target.kind, id: createdId });
    });
  const revoke = () =>
    feedback.runAction(async () => {
      if (revoking || !target.id) return;
      setRevoking(true);
      try {
        const removed =
          target.kind === "automation"
            ? await session.revokeToken(target.id)
            : await session.revokeTrustedClientToken(target.id);
        if (removed) onCompleted({ kind: target.kind, id: null });
      } finally {
        setRevoking(false);
      }
    });
  return (
    <SettingsPage
      title={title}
      label="API 访问"
      errorMessage={errorMessage}
      actions={
        creating ? (
          <FormSaveActions
            busy={busy}
            canDiscard={draft.dirty}
            canSave={
              !!draft.draft.name.trim() &&
              (target.kind === "trusted" ||
                (scopes.length > 0 &&
                  (draft.draft.permissions.workspace === "none" ||
                    draft.draft.repositoryIds === null ||
                    draft.draft.repositoryIds.length > 0)))
            }
            formId="api-token-form"
            onDiscard={draft.discard}
            saveLabel={
              target.kind === "automation" ? "创建令牌" : "创建可信客户端令牌"
            }
          />
        ) : undefined
      }
    >
      {creating ? (
        <ApiAccessSettingsForm
          busy={busy}
          draft={draft.draft}
          kind={target.kind}
          onChange={draft.change}
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
          repositories={session.repositories}
        />
      ) : token ? (
        <>
          <ToolPropertyList aria-label="令牌权限">
            <ToolPropertyRow
              label="权限"
              value={
                automationToken ? automationToken.scopes.join("、") : "完整同步"
              }
            />
            {automationToken ? (
              <ToolPropertyRow
                label="仓库范围"
                value={automationToken.repositoryIds?.join("、") || "全部仓库"}
              />
            ) : null}
          </ToolPropertyList>
          {session.snapshot.secret ? (
            <>
              <p>密钥仅在当前页面显示一次，请保存后关闭显示。</p>
              <ToolPropertyList aria-label="新令牌">
                <ToolPropertyRow
                  label="密钥"
                  value={
                    <code data-sensitive="true">{session.snapshot.secret}</code>
                  }
                  actions={
                    <Button onClick={session.dismissSecret} type="button">
                      关闭显示
                    </Button>
                  }
                />
              </ToolPropertyList>
            </>
          ) : null}
          <div className="ui-actions">
            <ConfirmAction
              confirming={confirming}
              disabled={busy}
              label="撤销令牌"
              onRequest={() => setConfirming(true)}
              onCancel={() => setConfirming(false)}
              onConfirm={() => void revoke()}
            />
          </div>
        </>
      ) : (
        <EmptyState
          compact
          title="令牌已移除"
          description="从左侧选择其他令牌，或创建新令牌。"
        />
      )}
    </SettingsPage>
  );
}
