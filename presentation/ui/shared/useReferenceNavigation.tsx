// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from "react";
import { useFeedback } from "./FeedbackProvider.tsx";
import { QuickPick } from "./QuickPick.tsx";

type ReferenceDestination = {
  description: string;
  id: string;
  label: string;
};

type ReferenceNavigation<Destination extends ReferenceDestination, Target extends { text: string }> = {
  navigate: (destination: Destination) => void;
  resolve: (target: Target) => Destination[];
};

export function useReferenceNavigation<Destination extends ReferenceDestination, Target extends { text: string }>(
  navigation: ReferenceNavigation<Destination, Target>,
) {
  const feedback = useFeedback();
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const close = () => setDestinations([]);
  const openReference = (target: Target) => {
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
