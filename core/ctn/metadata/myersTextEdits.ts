// SPDX-License-Identifier: GPL-3.0-or-later

import type { CtnTextEdit } from "./textEdits.ts";

type DiffKind = "delete" | "equal" | "insert";

type DiffChunk = {
  kind: DiffKind;
  tokens: string[];
};

export type CtnLineDiffChunk = Readonly<{
  kind: DiffKind;
  lines: readonly string[];
}>;

function appendChunk(
  chunks: DiffChunk[],
  kind: DiffKind,
  tokens: readonly string[],
) {
  if (tokens.length === 0) {
    return;
  }

  const previous = chunks.at(-1);

  if (previous?.kind === kind) {
    previous.tokens.push(...tokens);
    return;
  }

  chunks.push({ kind, tokens: [...tokens] });
}

function diffSingleToken(
  previousTokens: readonly string[],
  nextTokens: readonly string[],
) {
  const chunks: DiffChunk[] = [];

  if (previousTokens.length === 1) {
    const matchIndex = nextTokens.indexOf(previousTokens[0] ?? "");

    if (matchIndex >= 0) {
      appendChunk(chunks, "insert", nextTokens.slice(0, matchIndex));
      appendChunk(chunks, "equal", previousTokens);
      appendChunk(chunks, "insert", nextTokens.slice(matchIndex + 1));
      return chunks;
    }
  }

  if (nextTokens.length === 1) {
    const matchIndex = previousTokens.indexOf(nextTokens[0] ?? "");

    if (matchIndex >= 0) {
      appendChunk(chunks, "delete", previousTokens.slice(0, matchIndex));
      appendChunk(chunks, "equal", nextTokens);
      appendChunk(chunks, "delete", previousTokens.slice(matchIndex + 1));
      return chunks;
    }
  }

  appendChunk(chunks, "delete", previousTokens);
  appendChunk(chunks, "insert", nextTokens);
  return chunks;
}

function bisectTokens(
  previousTokens: readonly string[],
  nextTokens: readonly string[],
  maximumBisectDepth: number,
): { previousIndex: number; nextIndex: number } | null {
  const previousLength = previousTokens.length;
  const nextLength = nextTokens.length;
  const theoreticalMaximumDistance = Math.ceil(
    (previousLength + nextLength) / 2,
  );

  if (Math.abs(previousLength - nextLength) > maximumBisectDepth * 2) {
    return null;
  }

  const maximumDistance = Math.min(
    theoreticalMaximumDistance,
    maximumBisectDepth,
  );
  const offset = maximumDistance + 1;
  const vectorLength = maximumDistance * 2 + 3;
  const forward = new Int32Array(vectorLength);
  const reverse = new Int32Array(vectorLength);

  forward.fill(-1);
  reverse.fill(-1);
  forward[offset + 1] = 0;
  reverse[offset + 1] = 0;

  const delta = previousLength - nextLength;
  const forwardOverlap = delta % 2 !== 0;

  for (let distance = 0; distance <= maximumDistance; distance += 1) {
    for (
      let diagonal = -distance;
      diagonal <= distance;
      diagonal += 2
    ) {
      const vectorIndex = offset + diagonal;
      let previousIndex: number;

      if (
        diagonal === -distance ||
        (diagonal !== distance &&
          forward[vectorIndex - 1] < forward[vectorIndex + 1])
      ) {
        previousIndex = forward[vectorIndex + 1];
      } else {
        previousIndex = forward[vectorIndex - 1] + 1;
      }

      let nextIndex = previousIndex - diagonal;

      while (
        previousIndex < previousLength &&
        nextIndex < nextLength &&
        previousTokens[previousIndex] === nextTokens[nextIndex]
      ) {
        previousIndex += 1;
        nextIndex += 1;
      }
      forward[vectorIndex] = previousIndex;

      if (!forwardOverlap) {
        continue;
      }

      const reverseDiagonal = delta - diagonal;
      const reverseIndex = offset + reverseDiagonal;

      if (
        reverseIndex >= 0 &&
        reverseIndex < vectorLength &&
        reverse[reverseIndex] >= 0 &&
        previousIndex >= previousLength - reverse[reverseIndex]
      ) {
        return { previousIndex, nextIndex };
      }
    }

    for (
      let diagonal = -distance;
      diagonal <= distance;
      diagonal += 2
    ) {
      const vectorIndex = offset + diagonal;
      let previousIndex: number;

      if (
        diagonal === -distance ||
        (diagonal !== distance &&
          reverse[vectorIndex - 1] < reverse[vectorIndex + 1])
      ) {
        previousIndex = reverse[vectorIndex + 1];
      } else {
        previousIndex = reverse[vectorIndex - 1] + 1;
      }

      let nextIndex = previousIndex - diagonal;

      while (
        previousIndex < previousLength &&
        nextIndex < nextLength &&
        previousTokens[previousLength - previousIndex - 1] ===
          nextTokens[nextLength - nextIndex - 1]
      ) {
        previousIndex += 1;
        nextIndex += 1;
      }
      reverse[vectorIndex] = previousIndex;

      if (forwardOverlap) {
        continue;
      }

      const forwardDiagonal = delta - diagonal;
      const forwardIndex = offset + forwardDiagonal;

      if (
        forwardIndex >= 0 &&
        forwardIndex < vectorLength &&
        forward[forwardIndex] >= 0 &&
        forward[forwardIndex] >= previousLength - previousIndex
      ) {
        const splitPreviousIndex = forward[forwardIndex];

        return {
          previousIndex: splitPreviousIndex,
          nextIndex: splitPreviousIndex - forwardDiagonal,
        };
      }
    }
  }

  return null;
}

function createTokenDiff(
  previousTokens: readonly string[],
  nextTokens: readonly string[],
  maximumBisectDepth: number,
): DiffChunk[] {
  let commonPrefixLength = 0;

  while (
    commonPrefixLength < previousTokens.length &&
    commonPrefixLength < nextTokens.length &&
    previousTokens[commonPrefixLength] === nextTokens[commonPrefixLength]
  ) {
    commonPrefixLength += 1;
  }

  let commonSuffixLength = 0;

  while (
    commonSuffixLength < previousTokens.length - commonPrefixLength &&
    commonSuffixLength < nextTokens.length - commonPrefixLength &&
    previousTokens[previousTokens.length - commonSuffixLength - 1] ===
      nextTokens[nextTokens.length - commonSuffixLength - 1]
  ) {
    commonSuffixLength += 1;
  }

  const previousMiddle = previousTokens.slice(
    commonPrefixLength,
    previousTokens.length - commonSuffixLength,
  );
  const nextMiddle = nextTokens.slice(
    commonPrefixLength,
    nextTokens.length - commonSuffixLength,
  );
  const chunks: DiffChunk[] = [];

  appendChunk(chunks, "equal", previousTokens.slice(0, commonPrefixLength));

  if (previousMiddle.length === 0) {
    appendChunk(chunks, "insert", nextMiddle);
  } else if (nextMiddle.length === 0) {
    appendChunk(chunks, "delete", previousMiddle);
  } else if (previousMiddle.length === 1 || nextMiddle.length === 1) {
    for (const chunk of diffSingleToken(previousMiddle, nextMiddle)) {
      appendChunk(chunks, chunk.kind, chunk.tokens);
    }
  } else {
    const split = bisectTokens(
      previousMiddle,
      nextMiddle,
      maximumBisectDepth,
    );

    if (
      !split ||
      (split.previousIndex === 0 && split.nextIndex === 0) ||
      (split.previousIndex === previousMiddle.length &&
        split.nextIndex === nextMiddle.length)
    ) {
      appendChunk(chunks, "delete", previousMiddle);
      appendChunk(chunks, "insert", nextMiddle);
    } else {
      const left = createTokenDiff(
        previousMiddle.slice(0, split.previousIndex),
        nextMiddle.slice(0, split.nextIndex),
        maximumBisectDepth,
      );
      const right = createTokenDiff(
        previousMiddle.slice(split.previousIndex),
        nextMiddle.slice(split.nextIndex),
        maximumBisectDepth,
      );

      for (const chunk of [...left, ...right]) {
        appendChunk(chunks, chunk.kind, chunk.tokens);
      }
    }
  }

  appendChunk(
    chunks,
    "equal",
    previousTokens.slice(previousTokens.length - commonSuffixLength),
  );
  return chunks;
}

const maximumCharacterDiffCodeUnits = 64 * 1_024;
const maximumCharacterBisectDepth = 1_024;
const maximumLineTokens = 100_000;
const maximumLineBisectDepth = 4_096;

function isHighSurrogate(codeUnit: number) {
  return codeUnit >= 0xd800 && codeUnit <= 0xdbff;
}

function isLowSurrogate(codeUnit: number) {
  return codeUnit >= 0xdc00 && codeUnit <= 0xdfff;
}

function findCommonBoundaries(
  previousSource: string,
  nextSource: string,
) {
  let prefixLength = 0;

  while (
    prefixLength < previousSource.length &&
    prefixLength < nextSource.length &&
    previousSource.charCodeAt(prefixLength) ===
      nextSource.charCodeAt(prefixLength)
  ) {
    prefixLength += 1;
  }
  if (
    prefixLength > 0 &&
    prefixLength < previousSource.length &&
    prefixLength < nextSource.length &&
    isHighSurrogate(previousSource.charCodeAt(prefixLength - 1))
  ) {
    prefixLength -= 1;
  }

  let suffixLength = 0;

  while (
    suffixLength < previousSource.length - prefixLength &&
    suffixLength < nextSource.length - prefixLength &&
    previousSource.charCodeAt(previousSource.length - suffixLength - 1) ===
      nextSource.charCodeAt(nextSource.length - suffixLength - 1)
  ) {
    suffixLength += 1;
  }
  if (
    suffixLength > 0 &&
    isLowSurrogate(
      previousSource.charCodeAt(previousSource.length - suffixLength),
    )
  ) {
    suffixLength -= 1;
  }

  return { prefixLength, suffixLength };
}

function createLineTokens(source: string): string[] | null {
  const tokens: string[] = [];
  let tokenStart = 0;
  let index = 0;

  while (index < source.length) {
    const codeUnit = source.charCodeAt(index);

    if (codeUnit !== 0x0a && codeUnit !== 0x0d) {
      index += 1;
      continue;
    }

    if (
      codeUnit === 0x0d &&
      source.charCodeAt(index + 1) === 0x0a
    ) {
      index += 1;
    }
    index += 1;
    tokens.push(source.slice(tokenStart, index));
    if (tokens.length > maximumLineTokens) {
      return null;
    }
    tokenStart = index;
  }

  if (tokenStart < source.length) {
    tokens.push(source.slice(tokenStart));
  }
  return tokens.length > maximumLineTokens ? null : tokens;
}

function displayLine(token: string) {
  return token.endsWith("\r\n")
    ? token.slice(0, -2)
    : token.endsWith("\n") || token.endsWith("\r")
      ? token.slice(0, -1)
      : token;
}

export function createMyersLineDiff(
  previousSource: string,
  nextSource: string,
): CtnLineDiffChunk[] {
  const previousLines = createLineTokens(previousSource);
  const nextLines = createLineTokens(nextSource);
  const chunks = previousLines && nextLines
    ? createTokenDiff(
        previousLines,
        nextLines,
        maximumLineBisectDepth,
      )
    : [
        { kind: "delete" as const, tokens: previousLines ?? [previousSource] },
        { kind: "insert" as const, tokens: nextLines ?? [nextSource] },
      ];

  return chunks
    .map(({ kind, tokens }) => ({
      kind,
      lines: tokens.map(displayLine),
    }))
    .filter(({ lines }) => lines.length > 0);
}

function chunksToTextEdits(
  chunks: readonly DiffChunk[],
  previousBaseOffset: number,
  refineChangedHunks: boolean,
): CtnTextEdit[] {
  const edits: CtnTextEdit[] = [];
  let previousOffset = previousBaseOffset;
  let pendingFrom: number | null = null;
  let pendingDeletedText = "";
  let pendingInsertedText = "";

  const flushPendingEdit = () => {
    if (pendingFrom === null) {
      return;
    }

    if (
      refineChangedHunks &&
      pendingDeletedText.length + pendingInsertedText.length <=
        maximumCharacterDiffCodeUnits
    ) {
      edits.push(
        ...createBoundedTextEdits(
          pendingDeletedText,
          pendingInsertedText,
          pendingFrom,
          false,
        ),
      );
    } else {
      edits.push({
        from: pendingFrom,
        insertedText: pendingInsertedText,
        to: previousOffset,
      });
    }
    pendingFrom = null;
    pendingDeletedText = "";
    pendingInsertedText = "";
  };

  for (const chunk of chunks) {
    const text = chunk.tokens.join("");

    if (chunk.kind === "equal") {
      flushPendingEdit();
      previousOffset += text.length;
      continue;
    }

    pendingFrom ??= previousOffset;
    if (chunk.kind === "delete") {
      pendingDeletedText += text;
      previousOffset += text.length;
    } else {
      pendingInsertedText += text;
    }
  }

  flushPendingEdit();
  return edits;
}

function createBoundedTextEdits(
  previousSource: string,
  nextSource: string,
  previousBaseOffset: number,
  allowLineDiff: boolean,
): CtnTextEdit[] {
  if (previousSource === nextSource) {
    return [];
  }

  const { prefixLength, suffixLength } = findCommonBoundaries(
    previousSource,
    nextSource,
  );
  const previousMiddle = previousSource.slice(
    prefixLength,
    previousSource.length - suffixLength,
  );
  const nextMiddle = nextSource.slice(
    prefixLength,
    nextSource.length - suffixLength,
  );
  const middleBaseOffset = previousBaseOffset + prefixLength;

  if (previousMiddle.length === 0 || nextMiddle.length === 0) {
    return [{
      from: middleBaseOffset,
      insertedText: nextMiddle,
      to: middleBaseOffset + previousMiddle.length,
    }];
  }

  if (
    previousMiddle.length + nextMiddle.length <=
      maximumCharacterDiffCodeUnits
  ) {
    return chunksToTextEdits(
      createTokenDiff(
        Array.from(previousMiddle),
        Array.from(nextMiddle),
        maximumCharacterBisectDepth,
      ),
      middleBaseOffset,
      false,
    );
  }

  if (allowLineDiff) {
    const previousLines = createLineTokens(previousMiddle);
    const nextLines = createLineTokens(nextMiddle);

    if (previousLines && nextLines) {
      return chunksToTextEdits(
        createTokenDiff(
          previousLines,
          nextLines,
          maximumLineBisectDepth,
        ),
        middleBaseOffset,
        true,
      );
    }
  }

  return [{
    from: middleBaseOffset,
    insertedText: nextMiddle,
    to: middleBaseOffset + previousMiddle.length,
  }];
}

/**
 * Produces deterministic edits in UTF-16 offsets, which are the coordinates
 * consumed by editor changes and canonical metadata reconcile. Small changed
 * regions use Myers over Unicode code points. Large documents first use Myers
 * over newline-preserving tokens and refine bounded hunks; an unanchored hunk
 * beyond those limits becomes one deterministic replacement to keep external
 * rescans from allocating memory proportional to a multi-megabyte character
 * frontier.
 */
export function createMyersTextEdits(
  previousSource: string,
  nextSource: string,
): CtnTextEdit[] {
  if (previousSource === nextSource) {
    return [];
  }

  return createBoundedTextEdits(previousSource, nextSource, 0, true);
}
