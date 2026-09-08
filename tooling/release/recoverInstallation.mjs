// SPDX-License-Identifier: GPL-3.0-or-later
import { recoverInstallation } from "./installRuntime.mjs";
if (process.argv.length !== 3) throw new Error("Usage: pnpm release:recover <installation-backup>");
console.log(await recoverInstallation(process.argv[2]));
