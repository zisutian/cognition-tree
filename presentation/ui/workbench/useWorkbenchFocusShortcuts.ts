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
    const canceledChordEscapes = new WeakSet<KeyboardEvent>();
    const clearChord = () => {
      chordActive = false;
      if (chordTimer) {
        clearTimeout(chordTimer);
        chordTimer = null;
      }
    };
    const handleChordKeyDown = (event: KeyboardEvent) => {
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
        } else if (key === "escape") {
          canceledChordEscapes.add(event);
        }
        return;
      }
    };

    const handleFocusEscape = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        focusMode &&
        !event.defaultPrevented &&
        !event.isComposing &&
        event.keyCode !== 229 &&
        !canceledChordEscapes.has(event)
      ) {
        event.preventDefault();
        actionsRef.current.onExitFocusMode();
      }
    };

    document.addEventListener("keydown", handleChordKeyDown, true);
    document.addEventListener("keydown", handleFocusEscape);
    return () => {
      clearChord();
      document.removeEventListener("keydown", handleChordKeyDown, true);
      document.removeEventListener("keydown", handleFocusEscape);
    };
  }, [enabled, focusMode]);
}
