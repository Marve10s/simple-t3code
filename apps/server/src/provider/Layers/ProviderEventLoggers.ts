import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { ServerConfig } from "../../config.ts";
import * as ResourceAttribution from "../../resourceTelemetry/ResourceAttribution.ts";
import * as EventNdjsonLogger from "./EventNdjsonLogger.ts";

export class ProviderEventLoggers extends Context.Service<
  ProviderEventLoggers,
  {
    readonly native: EventNdjsonLogger.EventNdjsonLogger | undefined;
    readonly canonical: EventNdjsonLogger.EventNdjsonLogger | undefined;
  }
>()("t3/provider/Layers/ProviderEventLoggers") {}

const NoOpProviderEventLoggers: ProviderEventLoggers["Service"] = {
  native: undefined,
  canonical: undefined,
};

/** @public */
export const make = Effect.gen(function* () {
  const { providerEventLogPath } = yield* ServerConfig;
  const attribution = yield* ResourceAttribution.ResourceAttribution;
  const store = yield* EventNdjsonLogger.makeEventNdjsonLogStore(providerEventLogPath, {
    attribution,
  }).pipe(
    Effect.catch((error) =>
      Effect.logWarning(error.message, { error }).pipe(
        Effect.annotateLogs({ scope: "provider-observability" }),
        Effect.as<EventNdjsonLogger.EventNdjsonLogStore | undefined>(undefined),
      ),
    ),
  );

  if (!store) {
    return ProviderEventLoggers.of(NoOpProviderEventLoggers);
  }

  yield* Effect.addFinalizer(() => store.close());
  return ProviderEventLoggers.of({
    native: store.logger("native"),
    canonical: store.logger("canonical"),
  });
});

export const layer = Layer.effect(ProviderEventLoggers, make);
