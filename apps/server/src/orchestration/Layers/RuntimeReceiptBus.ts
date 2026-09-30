import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import { RuntimeReceiptBus, type RuntimeReceiptBusShape } from "../Services/RuntimeReceiptBus.ts";

const makeRuntimeReceiptBus = Effect.succeed({
  publish: () => Effect.void,
  streamEventsForTest: Stream.empty,
} satisfies RuntimeReceiptBusShape);

export const RuntimeReceiptBusLive = Layer.effect(RuntimeReceiptBus, makeRuntimeReceiptBus);
