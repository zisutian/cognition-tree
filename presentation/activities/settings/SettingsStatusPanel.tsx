// SPDX-License-Identifier: GPL-3.0-or-later

import type { ReactNode } from "react";
import { Page, PageBody } from "../../ui/index.ts";

export function SettingsStatusPanel({ children }: { children: ReactNode }) {
  return (
    <Page aria-label="设置状态">
      <PageBody>{children}</PageBody>
    </Page>
  );
}
