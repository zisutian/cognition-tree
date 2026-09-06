// SPDX-License-Identifier: GPL-3.0-or-later

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { AgentApplication } from "../../../application/agent/index.ts";
import type { ApiAccessApplication } from "../../../application/apiAccess/index.ts";
import type { OperationApplication } from "../../../application/operations/index.ts";
import type {
  SystemApplication,
  SystemReconnectPort,
} from "../../../application/system/index.ts";
import {
  type ActivityControllerProps,
  type ActivityId,
  type ActivityInteractionState,
  useFeedback,
} from "../../ui/index.ts";
import { createSettingsActivitySlots } from "./SettingsActivitySlots.tsx";
import { settingsTargetKey, type SettingsTarget } from "./settingsTypes.ts";
import { useApiAccessSettingsSession } from "./useApiAccessSettingsSession.ts";
import { useOperationsSettingsSession } from "./useOperationsSettingsSession.ts";
import { idleSettingsInteraction } from "./useSettingsInteraction.ts";
import { useSystemOwnerCredentialSession } from "./useSystemOwnerCredentialSession.ts";

export function SettingsActivityController({
  active,
  application,
  navigation,
  onInteractionStateChange,
  renderActivity,
}: SettingsActivityControllerProps) {
  const feedback = useFeedback();
  const [target, setTarget] = useState<SettingsTarget>({ kind: "interface" });
  const [interaction, setInteraction] = useState(idleSettingsInteraction);
  const currentInteraction = useRef(interaction);
  const api = useApiAccessSettingsSession(application.apiAccess);
  const operations = useOperationsSettingsSession(
    application.operations.administration,
  );
  const owner = useSystemOwnerCredentialSession(
    application.system.configurationController,
  );
  const report = useCallback(
    (next: ActivityInteractionState) => {
      currentInteraction.current = next;
      setInteraction((current) =>
        current.navigationBlocked === next.navigationBlocked &&
        current.statusMessage === next.statusMessage
          ? current
          : next,
      );
      onInteractionStateChange("settings", next);
    },
    [onInteractionStateChange],
  );
  const refresh = () =>
    void feedback.runAction(async () => {
      await Promise.all([
        application.agent.configurationController.load(),
        application.agent.controller.refreshStatus(),
        application.system.configurationController.load(),
        api.load(),
        ...(target.kind === "audit" ? [operations.load()] : []),
      ]);
    });
  useEffect(() => {
    if (active) void api.load();
  }, [active, api.load]);
  useEffect(() => {
    if (active && target.kind === "audit") void operations.load();
  }, [active, target.kind, operations.load]);
  useLayoutEffect(() => {
    if (!active) {
      api.reset();
      owner.dismissSecret();
      operations.reset();
      report(idleSettingsInteraction);
    }
  }, [active, api.reset, owner.dismissSecret, operations.reset, report]);
  const select = (next: SettingsTarget) => {
    if (settingsTargetKey(next) === settingsTargetKey(target)) return;
    if (currentInteraction.current.navigationBlocked) return;
    api.dismissSecret();
    owner.dismissSecret();
    report(idleSettingsInteraction);
    setTarget(next);
  };
  const completed = (next: SettingsTarget) => {
    report(idleSettingsInteraction);
    setTarget(next);
  };
  return active
    ? renderActivity(
        ({ contextWidth, onCollapseDetail, onContextWidthChange }) =>
          createSettingsActivitySlots({
            agent: application.agent,
            api,
            blocked: interaction.navigationBlocked,
            navigation,
            onCollapseDetail,
            onCompleted: completed,
            onRefresh: refresh,
            onSelect: select,
            operations,
            owner,
            report,
            system: application.system,
            target,
            workbench: { contextWidth, onContextWidthChange },
          }),
      )
    : null;
}

export type SettingsActivityApplication = {
  agent: AgentApplication;
  apiAccess: ApiAccessApplication;
  operations: OperationApplication;
  system: SystemApplication;
};
export type SettingsActivityControllerProps =
  ActivityControllerProps<SettingsActivityApplication> & {
    navigation: SystemReconnectPort;
    onInteractionStateChange(
      activityId: ActivityId,
      state: ActivityInteractionState,
    ): void;
  };
