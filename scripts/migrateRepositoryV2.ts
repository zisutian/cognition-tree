import { migrateRepositoryV2 } from "./repository-v2/migrateRepositoryV2.ts";

function printUsage() {
  console.log("Usage: pnpm repository:migrate-v2 -- <repository-directory>");
}

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  printUsage();
} else if (args.length !== 1) {
  printUsage();
  process.exitCode = 1;
} else {
  try {
    const result = await migrateRepositoryV2(args[0]);

    console.log(`Migrated ${result.noteCount} notes to repository v2.`);
    console.log(`Repository: ${result.repositoryPath}`);
    console.log(`Backup: ${result.backupPath}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
