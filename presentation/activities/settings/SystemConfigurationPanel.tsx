// SPDX-License-Identifier: GPL-3.0-or-later

import { EmptyState } from "compact-ui";

import type {
  SystemConfigurationController,
  SystemConfigurationState,
  SystemReconnectPort,
} from "../../../application/system/index.ts";
import {
  AssociatedForm,
  FormSaveActions,
  useFeedback,
} from "../../ui/index.ts";
import { SettingsPage } from "./SettingsPage.tsx";
import {
  SystemConfigurationFields,
  type SystemConfigurationPage,
} from "./SystemConfigurationFields.tsx";
import {
  useSettingsInteraction,
  type SettingsInteractionReporter,
} from "./useSettingsInteraction.ts";
import { useSystemConfigurationDraft } from "./useSystemConfigurationDraft.ts";
import { useSystemReconnect } from "./useSystemReconnect.ts";

export function SystemConfigurationPanel({
  controller,
  navigation,
  page,
  report,
  state,
}: {
  controller: Pick<SystemConfigurationController, "update">;
  navigation: SystemReconnectPort;
  page: SystemConfigurationPage;
  report: SettingsInteractionReporter;
  state: SystemConfigurationState;
}) {
  const feedback = useFeedback();
  const draft = useSystemConfigurationDraft({
    configuration: state.configuration,
    controller,
  });
  const { cancel, reconnect } = useSystemReconnect(navigation);
  const errorMessage = draft.stale
    ? "服务设置已在其他位置更新"
    : state.errorMessage;
  useSettingsInteraction(report, { ...draft, errorMessage });
  const busy = state.operationStatus === "working" || draft.submitting;
  return (
    <SettingsPage
      label="服务设置"
      errorMessage={errorMessage}
      actions={
        <FormSaveActions
          busy={busy}
          canDiscard={draft.dirty || draft.stale}
          canSave={draft.dirty && !draft.stale}
          formId="system-settings-form"
          onDiscard={() => {
            cancel();
            draft.discardChanges();
          }}
          saveLabel="保存服务设置"
        />
      }
    >
      {draft.draft ? (
        <AssociatedForm
          id="system-settings-form"
          onSubmit={(event) => {
            event.preventDefault();
            void feedback.runAction(async () => {
              const result = await draft.submit();
              if (result.restartConfiguration)
                reconnect(
                  result.restartConfiguration.listenMode === "lan"
                    ? result.restartConfiguration.publicOrigin
                    : `http://127.0.0.1:${result.restartConfiguration.port}`,
                );
            });
          }}
        >
          <SystemConfigurationFields
            draft={draft.draft}
            onChange={(value) => {
              cancel();
              draft.change(value);
            }}
            page={page}
          />
        </AssociatedForm>
      ) : (
        <EmptyState title="正在读取服务设置" />
      )}
    </SettingsPage>
  );
}
