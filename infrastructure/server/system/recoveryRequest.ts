// SPDX-License-Identifier: GPL-3.0-or-later

import type { IncomingMessage } from "node:http";
import {
  JsonRequestBodyError,
  readJsonRequestBody,
} from "../network/jsonRequestBody.ts";

export const maximumRecoveryRequestBodyBytes = 16_384;

export class RecoveryRequestAbortedError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super("Recovery request was aborted");
    this.name = "RecoveryRequestAbortedError";
    this.cause = cause;
  }
}

export class RecoveryRequestError extends Error {
  readonly statusCode: 400 | 413 | 415 | 422;

  constructor(message: string, statusCode: 400 | 413 | 415 | 422) {
    super(message);
    this.name = "RecoveryRequestError";
    this.statusCode = statusCode;
  }
}

export function parseRecoveryRequestBody(value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== 1 ||
    !Object.prototype.hasOwnProperty.call(value, "dataRoot")
  ) {
    throw new RecoveryRequestError("Recovery request is invalid", 422);
  }
  const dataRoot = (value as { dataRoot: unknown }).dataRoot;

  if (dataRoot !== null && typeof dataRoot !== "string") {
    throw new RecoveryRequestError("Recovery request is invalid", 422);
  }
  return dataRoot;
}

export async function readRecoveryRequestDataRoot(request: IncomingMessage) {
  let value: unknown;

  try {
    value = await readJsonRequestBody(
      request,
      maximumRecoveryRequestBodyBytes,
    );
  } catch (error) {
    if (!(error instanceof JsonRequestBodyError)) throw error;
    if (error.failure === "aborted") {
      throw new RecoveryRequestAbortedError(error.cause);
    }
    if (error.failure === "too-large") {
      throw new RecoveryRequestError("Recovery request is too large", 413);
    }
    if (error.failure === "unsupported-media-type") {
      throw new RecoveryRequestError(
        "Content-Type must be application/json",
        415,
      );
    }
    throw new RecoveryRequestError("Recovery request is invalid", 400);
  }
  return parseRecoveryRequestBody(value);
}
