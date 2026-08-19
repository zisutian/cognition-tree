import { expect } from "vitest";

type MarkupPattern = string | RegExp;

type MarkupSemantics = {
  has?: readonly MarkupPattern[];
  lacks?: readonly MarkupPattern[];
  ordered?: readonly string[];
};

function includes(markup: string, pattern: MarkupPattern) {
  if (typeof pattern === "string") return markup.includes(pattern);
  pattern.lastIndex = 0;
  return pattern.test(markup);
}

export function expectMarkupSemantics(
  markup: string,
  { has = [], lacks = [], ordered = [] }: MarkupSemantics,
) {
  const positions = ordered.map((fragment) => markup.indexOf(fragment));
  const label = (pattern: MarkupPattern) => pattern.toString();

  expect([
    ...has.filter((pattern) => !includes(markup, pattern))
      .map((pattern) => `missing: ${label(pattern)}`),
    ...lacks.filter((pattern) => includes(markup, pattern))
      .map((pattern) => `unexpected: ${label(pattern)}`),
    ...positions.flatMap((position, index) =>
      position < 0 || (index > 0 && position <= positions[index - 1]!)
        ? [`order: ${position}:${ordered[index]}`]
        : []
    ),
    ...[...has, ...lacks, ...ordered]
      .filter((pattern): pattern is string => typeof pattern === "string")
      .filter((fragment) => /\b(?:class|style)=|--(?:app|ctn|ui)-/.test(fragment))
      .map((fragment) => `implementation detail: ${fragment}`),
  ]).toEqual([]);
}
