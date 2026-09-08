// SPDX-License-Identifier: GPL-3.0-or-later

import type { SystemConfigurationInput } from "../../../application/system/index.ts";
import {
  SelectControl,
  FieldRow,
  FormLayout,
  InputControl,
} from "../../ui/index.ts";

export type SystemConfigurationPage = "network" | "paths" | "audit-retention";
export function SystemConfigurationFields({
  draft,
  onChange,
  page,
}: {
  draft: SystemConfigurationInput;
  onChange(value: SystemConfigurationInput): void;
  page: SystemConfigurationPage;
}) {
  return (
    <FormLayout layout="stacked">
      {page === "network" ? (
        <>
          <FieldRow fieldId="settings-system-listen-mode" label="访问范围">
            {(accessibility) => (
              <SelectControl
                {...accessibility}
                aria-label="服务访问范围"
                value={draft.listenMode}
                onChange={event => {
                  const listenMode = event.currentTarget.value as SystemConfigurationInput["listenMode"];
                  onChange({ ...draft, listenMode, publicOrigin: listenMode === "loopback" ? null : draft.publicOrigin });
                }}
              >
                <option value="loopback">仅本机</option>
                <option value="lan">局域网</option>
              </SelectControl>
            )}
          </FieldRow>
          <FieldRow fieldId="settings-system-port" label="端口">
            {(accessibility) => (
              <InputControl
                {...accessibility}
                aria-label="服务端口"
                min={1}
                max={65535}
                required
                type="number"
                value={Number.isNaN(draft.port) ? "" : draft.port}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    port: event.currentTarget.valueAsNumber,
                  })
                }
              />
            )}
          </FieldRow>
          {draft.listenMode === "lan" ? (
            <FieldRow
              fieldId="settings-system-public-origin"
              label="HTTPS 公开地址"
            >
              {(accessibility) => (
                <InputControl
                  {...accessibility}
                  aria-label="HTTPS 公开地址"
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      publicOrigin: event.currentTarget.value || null,
                    })
                  }
                  placeholder="https://tree.example.com"
                  required
                  value={draft.publicOrigin ?? ""}
                />
              )}
            </FieldRow>
          ) : null}
        </>
      ) : page === "paths" ? (
        <FieldRow fieldId="settings-system-host-root" label="宿主机显示路径">
          {(accessibility) => (
            <InputControl
              {...accessibility}
              aria-label="宿主机仓库显示路径"
              onChange={(event) =>
                onChange({
                  ...draft,
                  repositoryHostRoot: event.currentTarget.value || null,
                })
              }
              value={draft.repositoryHostRoot ?? ""}
            />
          )}
        </FieldRow>
      ) : (
        <FieldRow fieldId="settings-system-audit-limit" label="审计保留条数">
          {(accessibility) => (
            <InputControl
              {...accessibility}
              aria-label="操作审计保留条数"
              min={1}
              required
              type="number"
              value={
                Number.isNaN(draft.maxAuditEntries) ? "" : draft.maxAuditEntries
              }
              onChange={(event) =>
                onChange({
                  ...draft,
                  maxAuditEntries: event.currentTarget.valueAsNumber,
                })
              }
            />
          )}
        </FieldRow>
      )}
    </FormLayout>
  );
}
