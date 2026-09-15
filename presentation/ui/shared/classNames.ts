/** Bind a component's local selectors while retaining readable DOM identifiers. */
export function createClassNames(
  ...modules: Readonly<Record<string, string>>[]
) {
  return (...names: Array<string | false | null | undefined>) => {
    const tokens = names
      .filter(Boolean)
      .flatMap((name) => (name as string).split(/\s+/));
    return [
      ...new Set(
        tokens.flatMap((token) => [
          token,
          ...modules.map((module) => module[token]).filter(Boolean),
        ]),
      ),
    ].join(" ");
  };
}

export const cx = createClassNames();
