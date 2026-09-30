import * as Schema from "effect/Schema";
import * as HttpApiSchema from "effect/unstable/httpapi/HttpApiSchema";

import {
  AuthSessionId,
  ClientSurface,
  ClientWebDeployment,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";

export const ServerAuthPolicy = Schema.Literals([
  "desktop-managed-local",
  "loopback-browser",
  "remote-reachable",
  "unsafe-no-auth",
]);
export type ServerAuthPolicy = typeof ServerAuthPolicy.Type;

export const ServerAuthBootstrapMethod = Schema.Literals(["desktop-bootstrap", "one-time-token"]);
export type ServerAuthBootstrapMethod = typeof ServerAuthBootstrapMethod.Type;

export const ServerAuthSessionMethod = Schema.Literals([
  "browser-session-cookie",
  "bearer-access-token",
  "dpop-access-token",
]);
export type ServerAuthSessionMethod = typeof ServerAuthSessionMethod.Type;

export const AuthOrchestrationReadScope = "orchestration:read" as const;
export const AuthOrchestrationOperateScope = "orchestration:operate" as const;
export const AuthTerminalOperateScope = "terminal:operate" as const;
export const AuthReviewWriteScope = "review:write" as const;
export const AuthAccessReadScope = "access:read" as const;
export const AuthAccessWriteScope = "access:write" as const;
export const AuthRelayReadScope = "relay:read" as const;
export const AuthRelayWriteScope = "relay:write" as const;
export const AuthEnvironmentScope = Schema.Literals([
  AuthOrchestrationReadScope,
  AuthOrchestrationOperateScope,
  AuthTerminalOperateScope,
  AuthReviewWriteScope,
  AuthAccessReadScope,
  AuthAccessWriteScope,
  AuthRelayReadScope,
  AuthRelayWriteScope,
]);
export type AuthEnvironmentScope = typeof AuthEnvironmentScope.Type;
export const AuthEnvironmentScopes = Schema.Array(AuthEnvironmentScope);
export type AuthEnvironmentScopes = typeof AuthEnvironmentScopes.Type;

export const AuthStandardClientScopes = [
  AuthOrchestrationReadScope,
  AuthOrchestrationOperateScope,
  AuthTerminalOperateScope,
  AuthReviewWriteScope,
  AuthRelayReadScope,
] as const;
export const AuthAdministrativeScopes = [
  ...AuthStandardClientScopes,
  AuthAccessReadScope,
  AuthAccessWriteScope,
  AuthRelayWriteScope,
] as const;

export const AuthTokenExchangeGrantType =
  "urn:ietf:params:oauth:grant-type:token-exchange" as const;
export const AuthAccessTokenType = "urn:ietf:params:oauth:token-type:access_token" as const;
export const AuthEnvironmentBootstrapTokenType =
  "urn:t3:params:oauth:token-type:environment-bootstrap" as const;

export const ServerAuthDescriptor = Schema.Struct({
  policy: ServerAuthPolicy,
  bootstrapMethods: Schema.Array(ServerAuthBootstrapMethod),
  sessionMethods: Schema.Array(ServerAuthSessionMethod),
  sessionCookieName: TrimmedNonEmptyString,
});
export type ServerAuthDescriptor = typeof ServerAuthDescriptor.Type;

export const AuthBrowserSessionRequest = Schema.Struct({
  credential: TrimmedNonEmptyString,
});
export type AuthBrowserSessionRequest = typeof AuthBrowserSessionRequest.Type;

export const AuthBrowserSessionResult = Schema.Struct({
  authenticated: Schema.Literal(true),
  scopes: AuthEnvironmentScopes,
  sessionMethod: ServerAuthSessionMethod,
  expiresAt: Schema.DateTimeUtc,
});
export type AuthBrowserSessionResult = typeof AuthBrowserSessionResult.Type;

export const AuthClientMetadataDeviceType = Schema.Literals([
  "desktop",
  "mobile",
  "tablet",
  "bot",
  "unknown",
]);
export type AuthClientMetadataDeviceType = typeof AuthClientMetadataDeviceType.Type;

export const AuthClientPresentationMetadata = Schema.Struct({
  label: Schema.optionalKey(TrimmedNonEmptyString),
  deviceType: Schema.optionalKey(AuthClientMetadataDeviceType),
  os: Schema.optionalKey(TrimmedNonEmptyString),
  osMajorVersion: Schema.optionalKey(Schema.Int),
  deviceModel: Schema.optionalKey(TrimmedNonEmptyString),
  surface: Schema.optionalKey(ClientSurface),
  webDeployment: Schema.optionalKey(ClientWebDeployment),
  browser: Schema.optionalKey(TrimmedNonEmptyString),
  appVersion: Schema.optionalKey(TrimmedNonEmptyString),
});
export type AuthClientPresentationMetadata = typeof AuthClientPresentationMetadata.Type;

export const AuthTokenExchangeRequest = Schema.Struct({
  grant_type: Schema.Literal(AuthTokenExchangeGrantType),
  subject_token: TrimmedNonEmptyString,
  subject_token_type: Schema.Literal(AuthEnvironmentBootstrapTokenType),
  requested_token_type: Schema.Literal(AuthAccessTokenType),
  scope: Schema.optionalKey(TrimmedNonEmptyString),
  client_label: Schema.optionalKey(TrimmedNonEmptyString),
  client_device_type: Schema.optionalKey(AuthClientMetadataDeviceType),
  client_os: Schema.optionalKey(TrimmedNonEmptyString),
}).pipe(HttpApiSchema.asFormUrlEncoded());
export type AuthTokenExchangeRequest = typeof AuthTokenExchangeRequest.Type;

export const AuthAccessTokenResult = Schema.Struct({
  access_token: TrimmedNonEmptyString,
  issued_token_type: Schema.Literal(AuthAccessTokenType),
  token_type: Schema.Literals(["Bearer", "DPoP"]),
  expires_in: Schema.Number,
  scope: TrimmedNonEmptyString,
});
export type AuthAccessTokenResult = typeof AuthAccessTokenResult.Type;

export const AuthWebSocketTicketResult = Schema.Struct({
  ticket: TrimmedNonEmptyString,
  expiresAt: Schema.DateTimeUtc,
});
export type AuthWebSocketTicketResult = typeof AuthWebSocketTicketResult.Type;

export const AuthPairingCredentialResult = Schema.Struct({
  id: TrimmedNonEmptyString,
  credential: TrimmedNonEmptyString,
  label: Schema.optionalKey(TrimmedNonEmptyString),
  expiresAt: Schema.DateTimeUtc,
});
export type AuthPairingCredentialResult = typeof AuthPairingCredentialResult.Type;

export const AuthPairingLink = Schema.Struct({
  id: TrimmedNonEmptyString,
  scopes: AuthEnvironmentScopes,
  subject: TrimmedNonEmptyString,
  label: Schema.optionalKey(TrimmedNonEmptyString),
  createdAt: Schema.DateTimeUtc,
  expiresAt: Schema.DateTimeUtc,
});
export type AuthPairingLink = typeof AuthPairingLink.Type;

export const AuthClientMetadata = Schema.Struct({
  label: Schema.optionalKey(TrimmedNonEmptyString),
  ipAddress: Schema.optionalKey(TrimmedNonEmptyString),
  userAgent: Schema.optionalKey(TrimmedNonEmptyString),
  deviceType: AuthClientMetadataDeviceType,
  os: Schema.optionalKey(TrimmedNonEmptyString),
  browser: Schema.optionalKey(TrimmedNonEmptyString),
});
export type AuthClientMetadata = typeof AuthClientMetadata.Type;

export const AuthClientSession = Schema.Struct({
  sessionId: AuthSessionId,
  subject: TrimmedNonEmptyString,
  scopes: AuthEnvironmentScopes,
  method: ServerAuthSessionMethod,
  client: AuthClientMetadata,
  issuedAt: Schema.DateTimeUtc,
  expiresAt: Schema.DateTimeUtc,
  lastConnectedAt: Schema.NullOr(Schema.DateTimeUtc),
  connected: Schema.Boolean,
  current: Schema.Boolean,
});
export type AuthClientSession = typeof AuthClientSession.Type;

export const AuthAccessSnapshot = Schema.Struct({
  pairingLinks: Schema.Array(AuthPairingLink),
  clientSessions: Schema.Array(AuthClientSession),
});
export type AuthAccessSnapshot = typeof AuthAccessSnapshot.Type;

export const AuthAccessStreamSnapshotEvent = Schema.Struct({
  version: Schema.Literal(1),
  revision: Schema.Number,
  type: Schema.Literal("snapshot"),
  payload: AuthAccessSnapshot,
});
export type AuthAccessStreamSnapshotEvent = typeof AuthAccessStreamSnapshotEvent.Type;

export const AuthAccessStreamPairingLinkUpsertedEvent = Schema.Struct({
  version: Schema.Literal(1),
  revision: Schema.Number,
  type: Schema.Literal("pairingLinkUpserted"),
  payload: AuthPairingLink,
});
export type AuthAccessStreamPairingLinkUpsertedEvent =
  typeof AuthAccessStreamPairingLinkUpsertedEvent.Type;

export const AuthAccessStreamPairingLinkRemovedEvent = Schema.Struct({
  version: Schema.Literal(1),
  revision: Schema.Number,
  type: Schema.Literal("pairingLinkRemoved"),
  payload: Schema.Struct({
    id: TrimmedNonEmptyString,
  }),
});
export type AuthAccessStreamPairingLinkRemovedEvent =
  typeof AuthAccessStreamPairingLinkRemovedEvent.Type;

export class AuthAccessStreamError extends Schema.TaggedError<AuthAccessStreamError>()(
  "AuthAccessStreamError",
  {
    message: Schema.String,
  },
) {}

export class EnvironmentAuthorizationError extends Schema.TaggedError<EnvironmentAuthorizationError>()(
  "EnvironmentAuthorizationError",
  {
    message: Schema.String,
    requiredScope: AuthEnvironmentScope,
  },
) {}

export const AuthAccessStreamClientUpsertedEvent = Schema.Struct({
  version: Schema.Literal(1),
  revision: Schema.Number,
  type: Schema.Literal("clientUpserted"),
  payload: AuthClientSession,
});
export type AuthAccessStreamClientUpsertedEvent = typeof AuthAccessStreamClientUpsertedEvent.Type;

export const AuthAccessStreamClientRemovedEvent = Schema.Struct({
  version: Schema.Literal(1),
  revision: Schema.Number,
  type: Schema.Literal("clientRemoved"),
  payload: Schema.Struct({
    sessionId: AuthSessionId,
  }),
});
export type AuthAccessStreamClientRemovedEvent = typeof AuthAccessStreamClientRemovedEvent.Type;

export const AuthAccessStreamEvent = Schema.Union([
  AuthAccessStreamSnapshotEvent,
  AuthAccessStreamPairingLinkUpsertedEvent,
  AuthAccessStreamPairingLinkRemovedEvent,
  AuthAccessStreamClientUpsertedEvent,
  AuthAccessStreamClientRemovedEvent,
]);
export type AuthAccessStreamEvent = typeof AuthAccessStreamEvent.Type;

export const AuthRevokePairingLinkInput = Schema.Struct({
  id: TrimmedNonEmptyString,
});
export type AuthRevokePairingLinkInput = typeof AuthRevokePairingLinkInput.Type;

export const AuthRevokeClientSessionInput = Schema.Struct({
  sessionId: AuthSessionId,
});
export type AuthRevokeClientSessionInput = typeof AuthRevokeClientSessionInput.Type;

export const AuthCreatePairingCredentialInput = Schema.Struct({
  label: Schema.optionalKey(TrimmedNonEmptyString),
  scopes: Schema.optionalKey(AuthEnvironmentScopes),
});
export type AuthCreatePairingCredentialInput = typeof AuthCreatePairingCredentialInput.Type;

export const AuthSessionState = Schema.Struct({
  authenticated: Schema.Boolean,
  auth: ServerAuthDescriptor,
  scopes: Schema.optionalKey(AuthEnvironmentScopes),
  sessionMethod: Schema.optionalKey(ServerAuthSessionMethod),
  expiresAt: Schema.optionalKey(Schema.DateTimeUtc),
});
export type AuthSessionState = typeof AuthSessionState.Type;
