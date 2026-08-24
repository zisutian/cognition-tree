// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentApplication } from "../../../application/agent";
import {
  Button,
  Panel,
  PanelBody,
  PanelHeader,
  Section,
} from "../../ui/shared/primitives";
import { useFeedback } from "../../ui/shared/FeedbackProvider";

const authenticationLabels = {
  configured: "认证已配置",
  missing: "认证未配置",
  "not-required": "无需认证",
  unknown: "认证状态未知",
} as const;

export function AgentSettingsPanel({
  agent,
}: {
  agent: AgentApplication;
}) {
  const feedback = useFeedback();
  const { controller, state } = agent;
  const profiles = state.status?.profiles ?? [];

  return (
    <Panel aria-label="智能体设置" className="settings-panel">
      <PanelHeader title="智能体" />
      <PanelBody scroll>
        <div className="settings-content-column settings-agent-content">
          <p className="settings-muted">
            Profile、模型参数和凭据由服务端管理。修改配置后需要重启或
            recreate 服务，再刷新这里的状态。
          </p>
          {state.errorMessage ? (
            <p className="settings-api-error" role="alert">
              {state.errorMessage}
            </p>
          ) : null}
          {state.status?.configurationProblem ? (
            <p className="settings-api-error" role="alert">
              {state.status.configurationProblem}
            </p>
          ) : null}
          <Section title="默认 Profile">
            <label className="settings-agent-profile-selection">
              <span>默认 Profile</span>
              <select
                aria-label="默认 Profile"
                className="ui-input"
                disabled={state.loadStatus === "loading"}
                onChange={(event) => {
                  const profileId = event.currentTarget.value;

                  controller.setPreferredProfile(profileId || null);
                }}
                value={state.preferredProfileId ?? ""}
              >
                <option value="">未选择</option>
                {profiles.map((profile) => (
                  <option
                    disabled={profile.availability !== "available"}
                    key={profile.id}
                    value={profile.id}
                  >
                    {profile.label}
                    {profile.availability === "unavailable" ? "（不可用）" : ""}
                  </option>
                ))}
              </select>
            </label>
            <p className="settings-muted">
              只影响以后创建的会话；既有会话不会切换 profile。
            </p>
          </Section>
          <Section title="服务端 Profiles">
            {profiles.length === 0 ? (
              <p className="settings-muted">服务端没有可用的 profile 配置。</p>
            ) : (
              <div className="settings-agent-profile-table-wrap">
                <table
                  aria-label="服务端 Agent Profiles"
                  className="settings-agent-profile-table"
                >
                  <thead>
                    <tr>
                      <th>Profile</th>
                      <th>模型</th>
                      <th>Runtime</th>
                      <th>认证</th>
                      <th>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profiles.map((profile) => (
                      <tr key={profile.id}>
                        <td><strong>{profile.label}</strong></td>
                        <td><code>{profile.model ?? "未知"}</code></td>
                        <td><code>{profile.kind}</code></td>
                        <td>{authenticationLabels[profile.authenticationStatus]}</td>
                        <td>
                          {profile.availability === "available"
                            ? "可用"
                            : profile.unavailableReason ?? "不可用"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
          <Section title="操作">
            <Button
              disabled={state.operationStatus === "working"}
              onClick={() => void feedback.runAction(controller.refreshStatus)}
              type="button"
            >
              刷新状态
            </Button>
          </Section>
        </div>
      </PanelBody>
    </Panel>
  );
}
