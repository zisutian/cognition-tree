import { readFileSync } from "node:fs";

const messageFile = process.argv[2];
const allowedTypes = [
  "feat",
  "fix",
  "perf",
  "refactor",
  "test",
  "docs",
  "chore",
  "build",
  "ci",
];
const headerPattern = new RegExp(
  `^(${allowedTypes.join("|")})\\([a-z0-9][a-z0-9-]*\\): .{1,72}$`,
);

function fail(message) {
  console.error(message);
  console.error("");
  console.error("Expected commit message:");
  console.error("");
  console.error("  type(scope): subject");
  console.error("");
  console.error(`Allowed types: ${allowedTypes.join(", ")}`);
  console.error("Example: refactor(workspace): enforce command boundary");
  process.exit(1);
}

if (!messageFile) {
  fail("Missing commit message file path.");
}

const header = readFileSync(messageFile, "utf8").split(/\r?\n/, 1)[0].trim();

if (!header) {
  fail("Commit message header is empty.");
}

if (
  header.startsWith("Merge ") ||
  header.startsWith("Revert ") ||
  header.startsWith("fixup! ") ||
  header.startsWith("squash! ")
) {
  process.exit(0);
}

if (!headerPattern.test(header)) {
  fail(`Invalid commit message header: ${header}`);
}
