// SPDX-License-Identifier: GPL-3.0-or-later

export type CtnSourceLine = {
  from: number;
  number: number;
  text: string;
  to: number;
};

export type CtnSourceText = {
  lines: readonly CtnSourceLine[];
  source: string;
  values: readonly string[];
};

export function createCtnSourceTextFromLines(
  inputValues: readonly string[],
): CtnSourceText {
  const values = inputValues.length > 0 ? [...inputValues] : [""];
  const source = values.join("\n");
  const lines: CtnSourceLine[] = [];
  let offset = 0;

  for (let index = 0; index < values.length; index += 1) {
    const text = values[index] ?? "";
    const line = {
      from: offset,
      number: index + 1,
      text,
      to: offset + text.length,
    };

    lines.push(line);
    offset = line.to + 1;
  }
  return {
    lines,
    source,
    values,
  };
}

export function createCtnSourceText(source: string): CtnSourceText {
  return createCtnSourceTextFromLines(source.split("\n"));
}

export function getCtnSourceLine(
  lines: readonly CtnSourceLine[],
  lineNumber: number,
) {
  return lines[lineNumber - 1] ?? null;
}

export function getCtnSourceLineAt(
  lines: readonly CtnSourceLine[],
  position: number,
) {
  let low = 0;
  let high = lines.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const line = lines[middle];

    if (position < line.from) {
      high = middle - 1;
    } else if (position > line.to) {
      low = middle + 1;
    } else {
      return line;
    }
  }
  return lines[Math.min(low, lines.length - 1)] ?? null;
}
