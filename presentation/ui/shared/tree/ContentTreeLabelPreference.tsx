import { createContext, useContext, useState, type ReactNode } from "react";

type ContentTreeLabelPreference = {
  labelsVisible: boolean;
  setLabelsVisible(visible: boolean): void;
};

const Context = createContext<ContentTreeLabelPreference | null>(null);

export function ContentTreeLabelPreferenceProvider({
  children,
  initialVisible,
  onChange,
}: {
  children: ReactNode;
  initialVisible: boolean;
  onChange(visible: boolean): void;
}) {
  const [labelsVisible, setVisible] = useState(initialVisible);
  const setLabelsVisible = (visible: boolean) => {
    setVisible(visible);
    onChange(visible);
  };
  return (
    <Context value={{ labelsVisible, setLabelsVisible }}>
      {children}
    </Context>
  );
}

export function useContentTreeLabelPreference() {
  const preference = useContext(Context);
  if (!preference) throw new Error("Content tree label preference is unavailable.");
  return preference;
}
