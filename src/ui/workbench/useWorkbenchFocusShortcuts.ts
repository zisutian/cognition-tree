import { useEffect, useRef } from "react";

const focusChordTimeoutMs = 1_500;

export function useWorkbenchFocusShortcuts({
  enabled,
  focusMode,
  onExitFocusMode,
  onToggleFocusMode,
}: {
  enabled: boolean;
  focusMode: boolean;
  onExitFocusMode: () => void;
  onToggleFocusMode: () => void;
}) {
  const actionsRef = useRef({ onExitFocusMode, onToggleFocusMode });

  actionsRef.current = { onExitFocusMode, onToggleFocusMode };

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let chordActive = false;
    let chordTimer: ReturnType<typeof setTimeout> | null = null;
    const clearChord = () => {
      chordActive = false;
      if (chordTimer) {
        clearTimeout(chordTimer);
        chordTimer = null;
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if ((event.ctrlKey || event.metaKey) && key === "k") {
        event.preventDefault();
        clearChord();
        chordActive = true;
        chordTimer = setTimeout(clearChord, focusChordTimeoutMs);
        return;
      }

      if (chordActive) {
        clearChord();
        if (key === "z") {
          event.preventDefault();
          actionsRef.current.onToggleFocusMode();
        }
        return;
      }

      if (
        key === "escape" &&
        focusMode &&
        !(event.target instanceof Element &&
          event.target.closest(".ui-overlay-backdrop"))
      ) {
        event.preventDefault();
        actionsRef.current.onExitFocusMode();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      clearChord();
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [enabled, focusMode]);
}
