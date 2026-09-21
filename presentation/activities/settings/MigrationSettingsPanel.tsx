// SPDX-License-Identifier: GPL-3.0-or-later

import {
  PropertyList as ToolPropertyList,
  PropertyRow as ToolPropertyRow,
} from "compact-ui";
import {
  Button,
  FieldRow,
  FormLayout,
  InputControl,
  Section,
} from "compact-ui";
import { createClassNames } from "../../ui/index.ts";
const cx = createClassNames();

import { useState } from "react";
import type {
  SystemConfigurationController,
  SystemConfigurationState,
  SystemReconnectPort,
} from "../../../application/system/index.ts";
import { ConfirmAction, useFeedback } from "../../ui/index.ts";
import { SettingsPage } from "./SettingsPage.tsx";
import {
  useSettingsInteraction,
  type SettingsInteractionReporter,
} from "./useSettingsInteraction.ts";
import { useSystemReconnect } from "./useSystemReconnect.ts";

const phaseLabels = {
  preparing: "准备",
  copying: "复制数据",
  verifying: "校验数据",
  committing: "切换数据位置",
  reconciling: "核对切换结果",
  restarting: "等待重启",
  completed: "已完成",
  failed: "未完成，继续使用源目录",
  "recovery-required": "需要恢复",
} as const;
const authorityLabels = {
  "not-committed": "尚未切换，源目录为权威位置",
  committed: "已确认切换至目标目录",
  unknown: "尚不能确认，保持维护状态",
} as const;

export function MigrationSettingsPanel({
  controller,
  navigation,
  report,
  state,
}: {
  controller: Pick<
    SystemConfigurationController,
    "migrateDataRoot" | "reconcileMigration" | "getSnapshot"
  >;
  navigation: SystemReconnectPort;
  report: SettingsInteractionReporter;
  state: SystemConfigurationState;
}) {
  const feedback = useFeedback();
  const [destination, setDestination] = useState("");
  const [confirming, setConfirming] = useState(false);
  const { cancel, reconnect } = useSystemReconnect(navigation);
  const migration = state.migration;
  const busy = state.operationStatus === "working";
  const recovering =
    migration?.status === "recovery-required" ||
    migration?.status === "restarting";
  useSettingsInteraction(report, {
    dirty: destination.length > 0,
    submitting: busy,
    errorMessage: state.errorMessage,
  });
  const resume = async () => {
    await controller.reconcileMigration();
    if (controller.getSnapshot().migration?.status === "restarting")
      reconnect(null);
  };
  return (
    <SettingsPage label="数据迁移设置" errorMessage={state.errorMessage}>
      <section aria-label="数据位置">
        <ToolPropertyList>
          <ToolPropertyRow
            label="本次服务位置"
            children={
              <code>
                {state.configuration?.effectiveConfiguration.dataRoot ??
                  "尚未读取"}
              </code>
            }
          />
        </ToolPropertyList>
      </section>
      {migration ? (
        <Section title="当前迁移">
          <section aria-label="数据根迁移状态">
            <ToolPropertyList>
              <ToolPropertyRow
                label="阶段"
                children={phaseLabels[migration.status]}
              />
              <ToolPropertyRow
                label="源目录"
                children={<code>{migration.source}</code>}
              />
              <ToolPropertyRow
                label="目标目录"
                children={<code>{migration.destination}</code>}
              />
              <ToolPropertyRow
                label="权威位置"
                children={authorityLabels[migration.commitOutcome]}
              />
              {migration.errorMessage ? (
                <ToolPropertyRow
                  label="恢复原因"
                  children={migration.errorMessage}
                />
              ) : null}
            </ToolPropertyList>
          </section>
          {recovering ? (
            <Button
              disabled={busy}
              onClick={() => void feedback.runAction(resume)}
              type="button"
            >
              重新对账
            </Button>
          ) : null}
        </Section>
      ) : null}
      {!recovering ? (
        <Section title="迁移到新位置">
          <FormLayout layout="stacked">
            <FieldRow fieldId="settings-migration-destination" label="新数据根">
              {(accessibility) => (
                <InputControl
                  {...accessibility}
                  aria-label="新数据根"
                  disabled={busy || confirming}
                  onChange={(event) => {
                    cancel();
                    setDestination(event.currentTarget.value);
                  }}
                  placeholder="新目录绝对路径"
                  value={destination}
                />
              )}
            </FieldRow>
          </FormLayout>
          {confirming ? <p>迁移期间暂停写入，源目录保留。</p> : null}
          <div className={cx("ui-actions")}>
            <ConfirmAction
              confirming={confirming}
              disabled={busy || !destination.trim()}
              label="开始迁移"
              onRequest={() => setConfirming(true)}
              onCancel={() => setConfirming(false)}
              onConfirm={() =>
                void feedback.runAction(async () => {
                  await controller.migrateDataRoot(destination);
                  setDestination("");
                  setConfirming(false);
                  if (
                    controller.getSnapshot().migration?.status === "restarting"
                  )
                    reconnect(null);
                })
              }
            />
            <Button
              disabled={busy || !destination}
              onClick={() => {
                cancel();
                setDestination("");
                setConfirming(false);
              }}
              type="button"
            >
              放弃修改
            </Button>
          </div>
        </Section>
      ) : destination ? (
        <Button
          disabled={busy}
          onClick={() => {
            setDestination("");
            setConfirming(false);
          }}
          type="button"
        >
          放弃修改
        </Button>
      ) : null}
    </SettingsPage>
  );
}
