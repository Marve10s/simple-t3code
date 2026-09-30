import * as Schema from "effect/Schema";

export const UsageLimitSourceId = Schema.String.pipe(Schema.brand("UsageLimitSourceId"));
export type UsageLimitSourceId = typeof UsageLimitSourceId.Type;
