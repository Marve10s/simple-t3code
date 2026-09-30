import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SchemaTransformation from "effect/SchemaTransformation";

export const TrimmedString = Schema.String.pipe(
  Schema.decodeTo(
    Schema.String,
    SchemaTransformation.transformEffect({
      decode: (value) => Effect.succeed(value.trim()),
      encode: (value) => Effect.succeed(value.trim()),
    }),
  ),
);
export const TrimmedNonEmptyString = TrimmedString.check(Schema.isNonEmpty());

export const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
export const PositiveInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));
export const PortSchema = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65535 }));

export const DpopFailureReason = Schema.Literals([
  "time_window",
  "key_mismatch",
  "request_mismatch",
  "token_mismatch",
  "replay",
  "invalid_proof",
]);
export type DpopFailureReason = typeof DpopFailureReason.Type;

export const IsoDateTime = Schema.String;
export type IsoDateTime = typeof IsoDateTime.Type;

export const ForwardCompatibleOptional = <Value extends Schema.Top>(value: Value) => {
  const decodeValue = Schema.decodeUnknownOption(value as never);
  return Schema.optionalKey(
    Schema.Unknown.pipe(
      Schema.decodeTo(
        Schema.UndefinedOr(value),
        SchemaTransformation.transform<Value["Encoded"] | undefined, unknown>({
          decode: (raw) =>
            Option.isSome(decodeValue(raw)) ? (raw as Value["Encoded"]) : undefined,
          encode: (raw) => raw,
        }),
      ),
    ),
  );
};

export const ForwardCompatibleNullable = <Value extends Schema.Top>(value: Value) => {
  const decodeValue = Schema.decodeUnknownOption(value as never);
  return Schema.Unknown.pipe(
    Schema.decodeTo(
      Schema.NullOr(value),
      SchemaTransformation.transform<Value["Encoded"] | null, unknown>({
        decode: (raw) => (Option.isSome(decodeValue(raw)) ? (raw as Value["Encoded"]) : null),
        encode: (raw) => raw,
      }),
    ),
  );
};

export const OmittedWhenNull = <Value extends Schema.Top>(value: Value) => {
  const decodeValue = Schema.decodeUnknownOption(value as never);
  return Schema.optionalKey(Schema.Unknown).pipe(
    Schema.decodeTo(
      Schema.NullOr(value),
      SchemaTransformation.transformOptional<Value["Encoded"] | null, unknown>({
        decode: (raw) =>
          Option.some(
            Option.isSome(raw) && Option.isSome(decodeValue(raw.value))
              ? (raw.value as Value["Encoded"])
              : null,
          ),
        encode: (raw) =>
          Option.isSome(raw) && raw.value !== null ? Option.some(raw.value) : Option.none(),
      }),
    ),
  );
};

export const ForwardCompatibleArray = <Element extends Schema.Top>(element: Element) => {
  const decodeElement = Schema.decodeUnknownOption(element as never);
  return Schema.Array(Schema.Unknown).pipe(
    Schema.decodeTo(
      Schema.Array(element),
      SchemaTransformation.transform<ReadonlyArray<Element["Encoded"]>, ReadonlyArray<unknown>>({
        decode: (values) =>
          values.filter((value) => Option.isSome(decodeElement(value))) as ReadonlyArray<
            Element["Encoded"]
          >,
        encode: (values) => values,
      }),
    ),
  );
};

const makeEntityId = <Brand extends string>(brand: Brand) => {
  return TrimmedNonEmptyString.pipe(Schema.brand(brand));
};

export const ThreadId = makeEntityId("ThreadId");
export type ThreadId = typeof ThreadId.Type;
export const ProjectId = makeEntityId("ProjectId");
export type ProjectId = typeof ProjectId.Type;
export const EnvironmentId = makeEntityId("EnvironmentId");
export type EnvironmentId = typeof EnvironmentId.Type;
export const CommandId = makeEntityId("CommandId");
export type CommandId = typeof CommandId.Type;
export const EventId = makeEntityId("EventId");
export type EventId = typeof EventId.Type;
export const MessageId = makeEntityId("MessageId");
export type MessageId = typeof MessageId.Type;
export const TurnId = makeEntityId("TurnId");
export type TurnId = typeof TurnId.Type;
export const AuthSessionId = makeEntityId("AuthSessionId");
export type AuthSessionId = typeof AuthSessionId.Type;
export const RpcClientId = NonNegativeInt.pipe(Schema.brand("RpcClientId"));
export type RpcClientId = typeof RpcClientId.Type;

export const ClientSurface = Schema.Literals(["web", "desktop", "mobile", "cli"]);
export type ClientSurface = typeof ClientSurface.Type;

export const ClientOs = Schema.Literals([
  "macOS",
  "Windows",
  "Linux",
  "iOS",
  "Android",
  "ChromeOS",
  "other",
  "unknown",
]);
export type ClientOs = typeof ClientOs.Type;

export const ClientDeviceType = Schema.Literals(["desktop", "phone", "tablet", "unknown"]);
export type ClientDeviceType = typeof ClientDeviceType.Type;

export const ClientWebDeployment = Schema.Literals(["hosted", "server"]);
export type ClientWebDeployment = typeof ClientWebDeployment.Type;

export const ClientConnectionMethod = Schema.Literals(["direct", "ssh", "relay", "unknown"]);
export type ClientConnectionMethod = typeof ClientConnectionMethod.Type;

export const ProviderItemId = makeEntityId("ProviderItemId");
export type ProviderItemId = typeof ProviderItemId.Type;
export const RuntimeSessionId = makeEntityId("RuntimeSessionId");
export type RuntimeSessionId = typeof RuntimeSessionId.Type;
export const RuntimeItemId = makeEntityId("RuntimeItemId");
export type RuntimeItemId = typeof RuntimeItemId.Type;
export const RuntimeRequestId = makeEntityId("RuntimeRequestId");
export type RuntimeRequestId = typeof RuntimeRequestId.Type;
export const RuntimeTaskId = makeEntityId("RuntimeTaskId");
export type RuntimeTaskId = typeof RuntimeTaskId.Type;
export const ApprovalRequestId = makeEntityId("ApprovalRequestId");
export type ApprovalRequestId = typeof ApprovalRequestId.Type;
export const CheckpointRef = makeEntityId("CheckpointRef");
export type CheckpointRef = typeof CheckpointRef.Type;
