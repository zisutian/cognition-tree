import { useState } from "react";
import type { NotesViewModel } from "../../../application/workspace/activities/notes/notesViewModel";
import type { CtnEditorReferenceTarget } from "../../../editor/ctnReferenceNavigation";
import { useFeedback } from "../../shared/FeedbackProvider";
import { QuickPick } from "../../shared/QuickPick";

export function useReferenceNavigation(
  navigation: NotesViewModel["referenceNavigation"],
) {
  const feedback = useFeedback();
  const [destinations, setDestinations] = useState<
    ReturnType<typeof navigation.resolve>
  >([]);
  const close = () => setDestinations([]);
  const openReference = (target: CtnEditorReferenceTarget) => {
    const resolved = navigation.resolve(target);

    if (resolved.length === 0) {
      feedback.notify(`未找到引用目标：${target.text}`);
      return;
    }
    if (resolved.length === 1) {
      navigation.navigate(resolved[0]);
      return;
    }

    setDestinations(resolved);
  };

  return {
    openReference,
    picker: (
      <QuickPick
        ariaLabel="选择引用目标"
        open={destinations.length > 0}
        options={destinations}
        placeholder="筛选引用目标"
        onClose={close}
        onSelect={(option) => {
          const destination = destinations.find(({ id }) => id === option.id);

          if (destination) {
            navigation.navigate(destination);
          }
          close();
        }}
      />
    ),
  };
}
