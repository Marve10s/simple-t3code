import * as NodeModule from "node:module";
import * as Effect from "effect/Effect";

export const flushCompileCache = Effect.try(() => NodeModule.flushCompileCache()).pipe(
  Effect.ignore,
);
