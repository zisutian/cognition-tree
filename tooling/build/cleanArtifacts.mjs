import path from "node:path";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  fileURLToPath(new URL("../../", import.meta.url)),
);
const artifactsDirectory = path.join(projectRoot, ".artifacts");
const requestedScope = process.argv[2];

if (requestedScope !== undefined && requestedScope !== "--build") {
  throw new Error(`Unsupported cleanup scope: ${requestedScope}`);
}
if (
  path.dirname(artifactsDirectory) !== projectRoot ||
  path.basename(artifactsDirectory) !== ".artifacts"
) {
  throw new Error("Refusing to clean an unresolved artifacts directory.");
}

const target = requestedScope === "--build"
  ? path.join(artifactsDirectory, "build")
  : artifactsDirectory;

await rm(target, { force: true, recursive: true });
