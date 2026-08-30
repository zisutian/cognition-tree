// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  recoveryPageHtml,
  recoveryPageScript,
  recoveryPageStylesheet,
} from "../../../../infrastructure/server/system/recoveryPage.ts";

describe("bootstrap recovery page", () => {
  it("uses external assets and accessible recovery feedback", () => {
    expect(recoveryPageHtml).toContain('lang="zh-CN"');
    expect(recoveryPageHtml).toContain('for="dataRoot"');
    expect(recoveryPageHtml).toContain('role="status"');
    expect(recoveryPageHtml).toContain('aria-live="polite"');
    expect(recoveryPageHtml).toContain('src="/recovery.js"');
    expect(recoveryPageHtml).toContain('href="/recovery.css"');
    expect(recoveryPageHtml).not.toContain("<style");
    expect(recoveryPageHtml).not.toContain("<script>");
  });

  it("restores submission after a recoverable request failure", () => {
    expect(recoveryPageScript).toContain("submit.disabled = true");
    expect(recoveryPageScript.match(/submit\.disabled = false/g)).toHaveLength(2);
    expect(recoveryPageScript).toContain("无法连接恢复服务，请重试。");
    expect(recoveryPageStylesheet).toContain('data-kind="error"');
    expect(recoveryPageStylesheet).not.toMatch(/border:\s*[1-9]/);
  });
});
