export type TextCorpus = Readonly<Record<string, string>>;

type PathPredicate = RegExp | ((filePath: string) => boolean);
type MatchCount = number | { max?: number; min?: number };

export type TextPolicy = {
  allowedPath?: PathPredicate;
  corpus: TextCorpus;
  matches?: MatchCount;
  name: string;
  pattern: RegExp;
  scope?: PathPredicate;
};

export function forbidTextPolicy(
  name: string,
  corpus: TextCorpus,
  pattern: RegExp,
  scope?: TextPolicy["scope"],
): TextPolicy {
  return { corpus, matches: 0, name, pattern, scope };
}

function test(value: string, predicate?: PathPredicate) {
  if (!predicate) return true;
  if (typeof predicate === "function") return predicate(value);
  predicate.lastIndex = 0;
  return predicate.test(value);
}

export function auditTextPolicies(policies: readonly TextPolicy[]) {
  const violations: string[] = [];

  for (const policy of policies) {
    const scoped = Object.entries(policy.corpus)
      .map(([filePath, source]) =>
        [filePath.replace(/^(?:\.\.\/)+/, ""), source] as const
      )
      .filter(([filePath]) => test(filePath, policy.scope));
    if (scoped.length === 0) {
      violations.push(`${policy.name}: scan scope is empty`);
      continue;
    }
    const matches = scoped
      .filter(([, source]) => test(source, policy.pattern))
      .map(([filePath]) => filePath)
      .sort();
    const unexpectedOwners = policy.allowedPath
      ? matches.filter((filePath) =>
        !test(filePath, policy.allowedPath)
      )
      : [];
    const minimum = typeof policy.matches === "number"
      ? policy.matches
      : policy.matches?.min ?? 0;
    const maximum = typeof policy.matches === "number"
      ? policy.matches
      : policy.matches?.max ?? Number.POSITIVE_INFINITY;
    if (matches.length < minimum || matches.length > maximum) {
      violations.push(
        `${policy.name}: expected ${minimum}..${maximum}, ` +
          `found ${matches.length} [${matches.join(", ")}]`,
      );
    }
    violations.push(...unexpectedOwners.map(
      (filePath) => `${policy.name}: unexpected owner ${filePath}`,
    ));
  }
  return violations;
}
