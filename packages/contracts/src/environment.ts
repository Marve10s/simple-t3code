import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import {
  EnvironmentId,
  ForwardCompatibleOptional,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";

export const ORCHESTRATION_PROTOCOL_VERSION = 1;
export const ORCHESTRATION_PROTOCOL_QUERY_PARAM = "orchestrationProtocol";

export const ExecutionEnvironmentPlatformOs = Schema.Literals([
  "darwin",
  "linux",
  "windows",
  "unknown",
]);
export type ExecutionEnvironmentPlatformOs = typeof ExecutionEnvironmentPlatformOs.Type;

export const ExecutionEnvironmentPlatformArch = Schema.Literals(["arm64", "x64", "other"]);
export type ExecutionEnvironmentPlatformArch = typeof ExecutionEnvironmentPlatformArch.Type;

export const ENVIRONMENT_MACHINE_KINDS = [
  "server",
  "cloud",
  "linux",
  "desktop",
  "laptop",
  "mac-mini",
  "mac-studio",
] as const;
export const EnvironmentMachineKind = Schema.Literals(ENVIRONMENT_MACHINE_KINDS);
export type EnvironmentMachineKind = typeof EnvironmentMachineKind.Type;
export const isEnvironmentMachineKind = Schema.is(EnvironmentMachineKind);

export const ExecutionEnvironmentPlatform = Schema.Struct({
  os: ExecutionEnvironmentPlatformOs,
  arch: ExecutionEnvironmentPlatformArch,
  machine: ForwardCompatibleOptional(EnvironmentMachineKind),
});

export const ThreadEnvMode = Schema.Literals(["local", "worktree"]);
export type ThreadEnvMode = typeof ThreadEnvMode.Type;

export const WorktreeSubmodules = Schema.Literals(["recursive", "top-level", "none"]);
export type WorktreeSubmodules = typeof WorktreeSubmodules.Type;
export type ExecutionEnvironmentPlatform = typeof ExecutionEnvironmentPlatform.Type;

export const ServerSelfUpdateMethod = Schema.Literals(["boot-service", "respawn", "desktop-app"]);
export type ServerSelfUpdateMethod = typeof ServerSelfUpdateMethod.Type;

export const ServerSelfUpdateCapability = Schema.Literals([
  "boot-service",
  "respawn",
  "desktop-managed",
]);
export type ServerSelfUpdateCapability = typeof ServerSelfUpdateCapability.Type;

export const ExecutionEnvironmentCapabilities = Schema.Struct({
  repositoryIdentity: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  connectionProbe: Schema.optionalKey(Schema.Boolean),
  attachmentUploads: Schema.optionalKey(Schema.Boolean),
  questionAttachments: Schema.optionalKey(Schema.Boolean),
  fileAttachments: Schema.optionalKey(
    Schema.Struct({
      maxUploadBytes: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
    }),
  ),
  pullRequests: Schema.optionalKey(Schema.Boolean),
  inlineMessageContext: Schema.optionalKey(Schema.Boolean),
  requiredWorktreeBootstrap: Schema.optionalKey(Schema.Boolean),
  threadSettlement: Schema.optionalKey(Schema.Boolean),
  threadAutoSettlement: Schema.optionalKey(Schema.Boolean),
  storageCleanup: Schema.optionalKey(Schema.Boolean),
  projectWorktreeCleanup: Schema.optionalKey(Schema.Boolean),
  threadRestartContinuation: Schema.optionalKey(Schema.Boolean),
  projectSettingsOverrides: Schema.optionalKey(Schema.Boolean),
  threadSnooze: Schema.optionalKey(Schema.Boolean),
  environmentThemes: Schema.optionalKey(Schema.Boolean),
  usageLimitSources: Schema.optionalKey(Schema.Boolean),
  usagePriceOverrides: Schema.optionalKey(Schema.Boolean),
  threadPinning: Schema.optionalKey(Schema.Boolean),
  threadPinReorder: Schema.optionalKey(Schema.Boolean),
  threadActiveReorder: Schema.optionalKey(Schema.Boolean),
  threadAutoSettleOptOut: Schema.optionalKey(Schema.Boolean),
  threadTitleRegeneration: Schema.optionalKey(Schema.Boolean),
  threadPullRequestLinking: Schema.optionalKey(Schema.Boolean),
  threadPullRequests: Schema.optionalKey(Schema.Boolean),
  pullRequestStackActions: Schema.optionalKey(Schema.Boolean),
  serverSelfUpdate: Schema.optionalKey(ServerSelfUpdateCapability),
  serverSelfUpdateProgress: Schema.optionalKey(Schema.Boolean),
  serverUpdateThreadContinuation: Schema.optionalKey(Schema.Boolean),
  agentActivityPublishing: Schema.optionalKey(Schema.Boolean),
  projectCloneTracking: Schema.optionalKey(Schema.Boolean),
  environmentIcon: Schema.optionalKey(Schema.Boolean),
  desktopAppUpdate: Schema.optionalKey(Schema.Boolean),
});
export type ExecutionEnvironmentCapabilities = typeof ExecutionEnvironmentCapabilities.Type;

export const ExecutionEnvironmentDescriptor = Schema.Struct({
  environmentId: EnvironmentId,
  label: TrimmedNonEmptyString,
  platform: ExecutionEnvironmentPlatform,
  serverVersion: TrimmedNonEmptyString,
  orchestrationProtocolVersion: Schema.optionalKey(Schema.Int),
  capabilities: ExecutionEnvironmentCapabilities,
});
export type ExecutionEnvironmentDescriptor = typeof ExecutionEnvironmentDescriptor.Type;

export const RepositoryIdentityLocator = Schema.Struct({
  source: Schema.Literal("git-remote"),
  remoteName: TrimmedNonEmptyString,
  remoteUrl: TrimmedNonEmptyString,
});
export type RepositoryIdentityLocator = typeof RepositoryIdentityLocator.Type;

export const RepositoryIdentity = Schema.Struct({
  canonicalKey: TrimmedNonEmptyString,
  locator: RepositoryIdentityLocator,
  webUrl: Schema.optionalKey(TrimmedNonEmptyString),
  rootPath: Schema.optionalKey(TrimmedNonEmptyString),
  displayName: Schema.optionalKey(TrimmedNonEmptyString),
  provider: Schema.optionalKey(TrimmedNonEmptyString),
  owner: Schema.optionalKey(TrimmedNonEmptyString),
  name: Schema.optionalKey(TrimmedNonEmptyString),
});
export type RepositoryIdentity = typeof RepositoryIdentity.Type;

export const ScopedProjectRef = Schema.Struct({
  environmentId: EnvironmentId,
  projectId: ProjectId,
});
export type ScopedProjectRef = typeof ScopedProjectRef.Type;

export const ScopedThreadRef = Schema.Struct({
  environmentId: EnvironmentId,
  threadId: ThreadId,
});
export type ScopedThreadRef = typeof ScopedThreadRef.Type;
