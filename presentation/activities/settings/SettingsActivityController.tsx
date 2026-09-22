// SPDX-License-Identifier: GPL-3.0-or-later

import {
  usePageDriver,
  usePageNavigation,
  describePage,
} from "../../navigation/index.ts";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { AgentApplication } from "../../../application/agent/index.ts";
import type {
  LocalContentAccess,
  OperationApplication,
} from "../../../application/operations/index.ts";
import type {
  SystemApplication,
  SystemReconnectPort,
} from "../../../application/system/index.ts";
import {
  useFeedback,
  type ActivityControllerProps,
  type ActivityId,
  type ActivityInteractionState,
} from "../../ui/index.ts";
import { createSettingsActivitySlots } from "./SettingsActivitySlots.tsx";
import {
  settingsTargetKey,
  settingsTargetFromKey,
  settingsPageLabels,
  type SettingsTarget,
} from "./settingsTypes.ts";
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
  const targetEpoch = useRef(0);
  const activeRef = useRef(active);
  const renderEpoch = targetEpoch.current;
  const [target, setTarget] = useState<SettingsTarget>({ kind: "interface" });
  const [interaction, setInteraction] = useState(idleSettingsInteraction);
  const currentInteraction = useRef(interaction);
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
        current.statusMessage === next.statusMessage &&
        current.errorMessage === next.errorMessage
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
        ...(target.kind === "audit" ? [operations.load()] : []),
      ]);
    });
  useEffect(() => {
    if (active && target.kind === "audit") void operations.load();
  }, [active, target.kind, operations.load]);
  useLayoutEffect(() => {
    activeRef.current = active;
    if (!active) {
      targetEpoch.current += 1;
      owner.dismissSecret();
      operations.reset();
      report(idleSettingsInteraction);
    }
    return () => {
      activeRef.current = false;
    };
  }, [active, owner.dismissSecret, operations.reset, report]);
  const select = (next: SettingsTarget) => {
    if (settingsTargetKey(next) === settingsTargetKey(target)) return;
    if (currentInteraction.current.navigationBlocked) return false;
    owner.dismissSecret();
    report(idleSettingsInteraction);
    targetEpoch.current += 1;
    setTarget(next);
  };
  const completed = (next: SettingsTarget) => {
    if (!activeRef.current || targetEpoch.current !== renderEpoch) return;
    report(idleSettingsInteraction);
    targetEpoch.current += 1;
    if (
      "id" in target &&
      target.id === null &&
      "id" in next &&
      next.id !== null
    )
      pages.created("settings", () => setTarget(next));
    else setTarget(next);
  };
  const pages = usePageNavigation();
  const describe = (value: SettingsTarget) => {
    const entity =
      value.kind === "provider" || value.kind === "profile"
        ? (value.kind === "provider"
            ? application.agent.configurationState.configuration?.providers
            : application.agent.configurationState.configuration?.profiles
          )?.find((item) => item.id === value.id)
        : null;
    const title =
      "id" in value && value.id === null
        ? `新建 ${settingsPageLabels[value.kind]}`
        : (entity?.label ?? settingsPageLabels[value.kind]);
    return describePage(
      "settings",
      "settings",
      settingsTargetKey(value),
      title,
    );
  };
  usePageDriver("settings", {
    current: () => describe(target),
    describe: (page) => {
      const value = settingsTargetFromKey(page.id);
      if (!value) return null;
      if (
        "id" in value &&
        value.id !== null &&
        application.agent.configurationState.configuration &&
        !(
          value.kind === "provider"
            ? application.agent.configurationState.configuration.providers
            : application.agent.configurationState.configuration.profiles
        ).some((item) => item.id === value.id)
      ) {
        return settingsTargetKey(value) === settingsTargetKey(target) &&
          interaction.navigationBlocked
          ? {
              ...describe(value),
              title: `${settingsPageLabels[value.kind]} 已移除`,
            }
          : null;
      }
      return describe(value);
    },
    select: (page) => {
      const value = settingsTargetFromKey(page.id);
      return value ? select(value) : false;
    },
  });
  return active
    ? renderActivity(({ contextWidth, onContextWidthChange }) =>
        createSettingsActivitySlots({
          agent: application.agent,
          localApi: application.localApi,
          blocked: interaction.navigationBlocked,
          navigation,
          onCompleted: completed,
          onRefresh: refresh,
          onSelect: (next, intent = "preview") => {
            pages.open(describe(next), intent, () => select(next));
          },
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
  localApi: LocalContentAccess;
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
