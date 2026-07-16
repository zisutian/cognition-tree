export const ctnBlockMetadataDirective = "@ctn-block";

export type CtnBlockMetadata = {
  createdAt: string;
  updatedAt: string;
};

export type CtnBlockMetadataRecord = CtnBlockMetadata & {
  id: string;
  indentText: string;
};

export class CtnBlockMetadataSyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CtnBlockMetadataSyntaxError";
  }
}

const blockIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const metadataLinePattern = /^([ \t]*)@ctn-block id=([^\s]+) created=([^\s]+) updated=([^\s]+)$/;

export function isCtnBlockMetadataDirectiveText(value: string) {
  return /^@ctn-block(?:\s|$)/.test(value.trimStart());
}

export function isCtnBlockId(value: string) {
  return blockIdPattern.test(value);
}

export function isCtnBlockTimestamp(value: string) {
  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function assertMetadataRecord(record: CtnBlockMetadataRecord) {
  if (!isCtnBlockId(record.id)) {
    throw new CtnBlockMetadataSyntaxError(`Invalid CTN block id: ${record.id}`);
  }

  if (!isCtnBlockTimestamp(record.createdAt)) {
    throw new CtnBlockMetadataSyntaxError(
      `Invalid CTN block created timestamp: ${record.createdAt}`,
    );
  }

  if (!isCtnBlockTimestamp(record.updatedAt)) {
    throw new CtnBlockMetadataSyntaxError(
      `Invalid CTN block updated timestamp: ${record.updatedAt}`,
    );
  }

  if (!/^[ \t]*$/.test(record.indentText)) {
    throw new CtnBlockMetadataSyntaxError(
      "CTN block metadata indentation must use whitespace.",
    );
  }
}

function createMetadataRecord(
  match: RegExpExecArray,
): CtnBlockMetadataRecord {
  return {
    createdAt: match[3],
    id: match[2],
    indentText: match[1],
    updatedAt: match[4],
  };
}

export function parseCtnBlockMetadataLine(
  line: string,
): CtnBlockMetadataRecord | null {
  if (!isCtnBlockMetadataDirectiveText(line)) {
    return null;
  }

  const match = metadataLinePattern.exec(line);

  if (!match) {
    throw new CtnBlockMetadataSyntaxError("Invalid CTN block metadata line.");
  }

  const record = createMetadataRecord(match);

  assertMetadataRecord(record);
  return record;
}

export function formatCtnBlockMetadataLine(record: CtnBlockMetadataRecord) {
  assertMetadataRecord(record);
  return `${record.indentText}${ctnBlockMetadataDirective} id=${record.id} created=${record.createdAt} updated=${record.updatedAt}`;
}
