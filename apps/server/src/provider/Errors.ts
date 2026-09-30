import * as Schema from "effect/Schema";

import type { CheckpointServiceError } from "../checkpointing/Errors.ts";

export class ProviderAdapterValidationError extends Schema.TaggedError<ProviderAdapterValidationError>()(
  "ProviderAdapterValidationError",
  {
    provider: Schema.String,
    operation: Schema.String,
    issue: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return `Provider adapter validation failed (${this.provider}) in ${this.operation}: ${this.issue}`;
  }
}

export class ProviderAdapterSessionNotFoundError extends Schema.TaggedError<ProviderAdapterSessionNotFoundError>()(
  "ProviderAdapterSessionNotFoundError",
  {
    provider: Schema.String,
    threadId: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return `Unknown ${this.provider} adapter thread: ${this.threadId}`;
  }
}

export class ProviderAdapterSessionClosedError extends Schema.TaggedError<ProviderAdapterSessionClosedError>()(
  "ProviderAdapterSessionClosedError",
  {
    provider: Schema.String,
    threadId: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return `${this.provider} adapter thread is closed: ${this.threadId}`;
  }
}

export class ProviderAdapterRequestError extends Schema.TaggedError<ProviderAdapterRequestError>()(
  "ProviderAdapterRequestError",
  {
    provider: Schema.String,
    method: Schema.String,
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return `Provider adapter request failed (${this.provider}) for ${this.method}: ${this.detail}`;
  }
}

export class ProviderAdapterProcessError extends Schema.TaggedError<ProviderAdapterProcessError>()(
  "ProviderAdapterProcessError",
  {
    provider: Schema.String,
    threadId: Schema.String,
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return `Provider adapter process error (${this.provider}) for thread ${this.threadId}: ${this.detail}`;
  }
}

export class ProviderWorkspaceMissingError extends Schema.TaggedError<ProviderWorkspaceMissingError>()(
  "ProviderWorkspaceMissingError",
  {
    threadId: Schema.String,
    cwd: Schema.String,
  },
) {
  override get message(): string {
    return `This thread's workspace folder no longer exists or is not a directory: ${this.cwd}. Restore the folder at this path before retrying.`;
  }
}

export class ProviderValidationError extends Schema.TaggedError<ProviderValidationError>()(
  "ProviderValidationError",
  {
    operation: Schema.String,
    issue: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return `Provider validation failed in ${this.operation}: ${this.issue}`;
  }
}

export class ProviderUnsupportedError extends Schema.TaggedError<ProviderUnsupportedError>()(
  "ProviderUnsupportedError",
  {
    provider: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return `Provider '${this.provider}' is not implemented`;
  }
}

export class ProviderInstanceNotFoundError extends Schema.TaggedError<ProviderInstanceNotFoundError>()(
  "ProviderInstanceNotFoundError",
  {
    instanceId: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return `No provider instance bound to id '${this.instanceId}'`;
  }
}

export class ProviderDriverError extends Schema.TaggedError<ProviderDriverError>()(
  "ProviderDriverError",
  {
    driver: Schema.String,
    instanceId: Schema.String,
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return `Provider driver '${this.driver}' failed to create instance '${this.instanceId}': ${this.detail}`;
  }
}

export class ProviderSessionNotFoundError extends Schema.TaggedError<ProviderSessionNotFoundError>()(
  "ProviderSessionNotFoundError",
  {
    threadId: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return `Unknown provider thread: ${this.threadId}`;
  }
}

export class ProviderSessionDirectoryPersistenceError extends Schema.TaggedError<ProviderSessionDirectoryPersistenceError>()(
  "ProviderSessionDirectoryPersistenceError",
  {
    operation: Schema.String,
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return `Provider session directory persistence error in ${this.operation}: ${this.detail}`;
  }
}

export type ProviderAdapterError =
  | ProviderAdapterValidationError
  | ProviderAdapterSessionNotFoundError
  | ProviderAdapterSessionClosedError
  | ProviderAdapterRequestError
  | ProviderAdapterProcessError;

export type ProviderServiceError =
  | ProviderValidationError
  | ProviderUnsupportedError
  | ProviderWorkspaceMissingError
  | ProviderInstanceNotFoundError
  | ProviderSessionNotFoundError
  | ProviderSessionDirectoryPersistenceError
  | ProviderAdapterError
  | CheckpointServiceError;
