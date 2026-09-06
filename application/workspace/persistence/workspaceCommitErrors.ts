// SPDX-License-Identifier: GPL-3.0-or-later

import { VersionedContentRevisionConflictError } from '../../persistence/index.ts';

export class WorkspaceRevisionConflictError extends VersionedContentRevisionConflictError {
  constructor(currentRevision: `sha256:${string}`) {
    super(currentRevision);
    this.message = 'Repository content changed outside the current session';
    this.name = 'WorkspaceRevisionConflictError';
  }
}
