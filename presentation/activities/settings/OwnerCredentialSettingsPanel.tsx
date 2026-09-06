// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from "react";
import type {
  OwnerAuthenticationController,
  SystemConfigurationState,
  SystemReconnectPort,
} from "../../../application/system/index.ts";
import {
  Button,
  ConfirmAction,
  ToolPropertyList,
  ToolPropertyRow,
  useFeedback,
} from "../../ui/index.ts";
import { SettingsPage } from "./SettingsPage.tsx";
import type { SystemOwnerCredentialPanelView } from "./useSystemOwnerCredentialSession.ts";
import {
  useSettingsInteraction,
  type SettingsInteractionReporter,
} from "./useSettingsInteraction.ts";

export function OwnerCredentialSettingsPanel({
  authentication,
  navigation,
  report,
  session,
  state,
}: {
  authentication: Pick<OwnerAuthenticationController, "logout">;
  navigation: SystemReconnectPort;
  report: SettingsInteractionReporter;
  session: SystemOwnerCredentialPanelView;
  state: SystemConfigurationState;
}) {
  const feedback = useFeedback();
  const [confirming, setConfirming] = useState(false);
  const snapshot = state.configuration;
  const preparation = session.snapshot.preparation;
  const awaiting =
    preparation !== null &&
    session.snapshot.activationStatus === "awaiting-confirmation";
  const busy = state.operationStatus === "working" || !snapshot;
  useSettingsInteraction(report, {
    submitting: state.operationStatus === "working",
    errorMessage: state.errorMessage,
  });
  return (
    <SettingsPage
      title="所有者凭据"
      label="所有者凭据设置"
      errorMessage={state.errorMessage}
    >
      {preparation ? (
        <>
          <p>
            {awaiting
              ? "请保存新密钥，再明确激活。"
              : "新密钥已激活，请妥善保存。"}
          </p>
          <ToolPropertyList aria-label="所有者密钥">
            <ToolPropertyRow
              label="新密钥"
              value={<code data-sensitive="true">{preparation.secret}</code>}
              actions={
                <Button
                  disabled={busy}
                  onClick={session.dismissSecret}
                  type="button"
                >
                  关闭显示
                </Button>
              }
            />
          </ToolPropertyList>
        </>
      ) : snapshot?.ownerCredentialRotationPending ? (
        <p>服务中有待激活轮换，当前页面没有明文密钥；重新准备将替换该轮换。</p>
      ) : null}
      {awaiting && state.errorMessage ? (
        <p>
          激活结果可能未知。请保留新密钥并刷新状态；若旧会话失效，请用新密钥重新登录。
        </p>
      ) : null}
      <div className="ui-actions">
        {!preparation ? (
          <Button
            disabled={busy}
            onClick={() =>
              void feedback.runAction(session.prepareOwnerCredentialRotation)
            }
            type="button"
          >
            {snapshot?.ownerCredentialRotationPending
              ? "重新准备新密钥"
              : snapshot?.ownerCredentialConfigured
                ? "准备轮换密钥"
                : "准备创建密钥"}
          </Button>
        ) : null}
        {awaiting ? (
          <Button
            disabled={busy}
            onClick={() =>
              void feedback.runAction(session.activatePreparedOwnerCredential)
            }
            type="button"
            variant="primary"
          >
            我已保存，激活新密钥
          </Button>
        ) : null}
        <ConfirmAction
          confirming={confirming}
          disabled={
            busy ||
            !!preparation ||
            (!snapshot?.ownerCredentialConfigured &&
              !snapshot?.ownerCredentialRotationPending) ||
            snapshot?.configuration.listenMode === "lan"
          }
          label="清除凭据"
          onRequest={() => setConfirming(true)}
          onCancel={() => setConfirming(false)}
          onConfirm={() =>
            void feedback.runAction(async () => {
              await session.clearOwnerCredential();
              setConfirming(false);
            })
          }
        />
        <Button
          disabled={busy}
          onClick={() => {
            session.dismissSecret();
            void feedback.runAction(async () => {
              await authentication.logout();
              navigation.reload();
            });
          }}
          type="button"
        >
          退出登录
        </Button>
      </div>
    </SettingsPage>
  );
}
