// SPDX-License-Identifier: GPL-3.0-or-later

import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Button, ColorPicker, CompactProvider } from "compact-ui";
import "compact-ui/styles.css";
import { uiConfig } from "../../presentation/ui/foundation/config.ts";
import { TriggerPopover } from "../../presentation/ui/shared/TriggerPopover.tsx";
import { useWorkbenchFocusShortcuts } from "../../presentation/ui/workbench/useWorkbenchFocusShortcuts.ts";

const colorOptions = [
  { label: "蓝色", value: "#123456" },
  { label: "红色", value: "#654321" },
];

function FocusEscapeFixture() {
  const [focusMode, setFocusMode] = useState(true);
  const [exitCalls, setExitCalls] = useState(0);
  const [color, setColor] = useState(colorOptions[0].value);

  useWorkbenchFocusShortcuts({
    enabled: true,
    focusMode,
    onExitFocusMode: () => {
      setExitCalls((count) => count + 1);
      setFocusMode(false);
    },
    onToggleFocusMode: () => setFocusMode((value) => !value),
  });

  return (
    <CompactProvider config={uiConfig}>
      <main style={{ padding: 24 }}>
        <output
          data-exit-calls={exitCalls}
          data-focus-mode={focusMode}
          id="focus-state"
        >
          专注模式状态
        </output>
        <TriggerPopover
          ariaLabel="外层设置"
          renderTrigger={({ isOpen, panelId, toggle, triggerRef }) => (
            <Button
              aria-controls={panelId}
              aria-expanded={isOpen}
              aria-haspopup="dialog"
              onClick={toggle}
              ref={triggerRef}
              type="button"
            >
              打开外层设置
            </Button>
          )}
        >
          {() => (
            <ColorPicker
              aria-label="内层颜色"
              onChange={setColor}
              options={colorOptions}
              value={color}
            />
          )}
        </TriggerPopover>
        <ColorPicker
          aria-label="独立颜色"
          onChange={setColor}
          options={colorOptions}
          value={color}
        />
      </main>
    </CompactProvider>
  );
}

createRoot(document.getElementById("root")!).render(<FocusEscapeFixture />);
