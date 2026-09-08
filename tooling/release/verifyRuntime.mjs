// SPDX-License-Identifier: GPL-3.0-or-later
import path from "node:path";
import { verifyRuntime } from "./runtimeManifest.mjs";
if (process.argv.length !== 3) throw new Error("Usage: pnpm release:verify <runtime-directory>");
const manifest = await verifyRuntime(path.resolve(process.argv[2]), { installed: true });
console.log(`Runtime verified: ${manifest.commit}`);
