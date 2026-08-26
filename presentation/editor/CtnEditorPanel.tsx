import { Maximize2, Minimize2 } from "lucide-react";
import type { ReactNode } from "react";
import {
  Button,
  Panel,
  PanelHeader,
} from "../ui/shared/primitives";
import "./CtnEditorPanel.css";

export function CtnEditorPanel({
  ariaLabel,
  children,
  focusMode,
  onToggleFocusMode,
  title,
}: {
  ariaLabel: string;
  children: ReactNode;
  focusMode: boolean;
  onToggleFocusMode: () => void;
  title: string;
}) {
  const focusModeLabel = focusMode ? "退出专注模式" : "进入专注模式";

  return (
    <Panel aria-label={ariaLabel} className="ctn-editor-panel">
      <PanelHeader
        actions={(
          <Button
            aria-label={focusModeLabel}
            onClick={onToggleFocusMode}
            title={focusModeLabel}
            type="button"
            variant="icon"
          >
            {focusMode
              ? <Minimize2 aria-hidden="true" size={14} />
              : <Maximize2 aria-hidden="true" size={14} />}
          </Button>
        )}
        title={title}
      />
      {children}
    </Panel>
  );
}
