import { describe, expect, it } from "vitest";
import { SettingsContext } from "../../../../../presentation/activities/settings/SettingsContext.tsx";
import { createAgentApplicationFixture } from "../../../../support/presentation/fixtures/agentApplicationFixture.ts";
import { renderToStaticMarkup } from "../../../../support/presentation/render.tsx";

describe("settings directory", () => {
  it("keeps both creation entries available as the first child of empty groups", () => {
    const agent = createAgentApplicationFixture().configurationState;
    const markup = renderToStaticMarkup(
      <SettingsContext agent={agent} blocked={false} target={{ kind: "interface" }} onSelect={() => undefined} />,
    );
    const labels = [...markup.matchAll(/role="treeitem"[^>]*aria-label="([^"]+)"/g)]
      .map((match) => match[1]);
    const providerIndex = labels.indexOf("模型服务（Provider）");
    const profileIndex = labels.indexOf("会话配置（Profile）");
    expect(providerIndex).toBeGreaterThanOrEqual(0);
    expect(profileIndex).toBeGreaterThanOrEqual(0);
    expect(labels[providerIndex + 1]).toBe("新建 Provider");
    expect(labels[profileIndex + 1]).toBe("新建 Profile");
  });
});
