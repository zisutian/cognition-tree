// SPDX-License-Identifier: GPL-3.0-or-later

import { AgentRuntimeProtocolError } from "../../../application/agent/index.ts";

export function withRuntimeTimeout<Value>(
  promise: Promise<Value>,
  milliseconds: number,
  message: string,
) {
  return new Promise<Value>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new AgentRuntimeProtocolError(message)),
      milliseconds,
    );

    timeout.unref();
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}
