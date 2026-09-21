// SPDX-License-Identifier: GPL-3.0-or-later

import {
  PropertyList as ToolPropertyList,
  PropertyRow as ToolPropertyRow,
} from "compact-ui";
import { Button } from "compact-ui";
import { createClassNames } from "../../ui/index.ts";
const cx = createClassNames();

import { useState } from "react";
import type {
  OwnerAuthenticationController,
  SystemConfigurationState,
  SystemReconnectPort,
} from "../../../application/system/index.ts";
import { ConfirmAction, useFeedback } from "../../ui/index.ts";
import { SettingsPage } from "./SettingsPage.tsx";
import {
  useSettingsInteraction,
  type SettingsInteractionReporter,
} from "./useSettingsInteraction.ts";
import type { SystemOwnerCredentialPanelView } from "./useSystemOwnerCredentialSession.ts";

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
    <SettingsPage label="所有者凭据设置" errorMessage={state.errorMessage}>
      {preparation ? (
        <>
          <p>{awaiting ? "新密钥待激活" : "新密钥已激活"}</p>
          <section aria-label="所有者密钥">
            <ToolPropertyList>
              <ToolPropertyRow
                label="新密钥"
                children={
                  <code data-sensitive="true">{preparation.secret}</code>
                }
                action={
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
          </section>
        </>
      ) : snapshot?.ownerCredentialRotationPending ? (
        <p>待激活密钥不在当前页面；重新准备将替换它。</p>
      ) : null}
      {awaiting && state.errorMessage ? <p>新密钥激活结果尚未确认</p> : null}
      <div className={cx("ui-actions")}>
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
            variant="normal"
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
