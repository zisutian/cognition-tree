import { useEffect, useRef } from "react";

export function isWorkbenchProblemsShortcut({
  altKey,
  ctrlKey,
  key,
  metaKey,
  shiftKey,
}: Pick<
  KeyboardEvent,
  "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
>) {
  return (
    ctrlKey &&
    shiftKey &&
    !altKey &&
    !metaKey &&
    key.toLowerCase() === "m"
  );
}

export function shouldHandleWorkbenchProblemsShortcut(
  enabled: boolean,
  event: Pick<
    KeyboardEvent,
    "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
  >,
) {
  return enabled && isWorkbenchProblemsShortcut(event);
}

export function useWorkbenchProblemsShortcut({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  const onToggleRef = useRef(onToggle);

  onToggleRef.current = onToggle;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!shouldHandleWorkbenchProblemsShortcut(enabled, event)) {
        return;
      }

      event.preventDefault();
      onToggleRef.current();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled]);
}
