// SPDX-License-Identifier: GPL-3.0-or-later

import { Type } from "@sinclair/typebox";
import { strictObject } from "../../common/index.ts";

export const ApiHealthSchema = strictObject({ ok: Type.Literal(true) });
