import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import { ProviderInstanceRegistry } from "../Services/ProviderInstanceRegistry.ts";
import { ProviderService } from "../Services/ProviderService.ts";

export const ProviderUsageLimitsIngestionLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const providerService = yield* ProviderService;
    const instanceRegistry = yield* ProviderInstanceRegistry;

    yield* providerService.streamEvents.pipe(
      Stream.filter((event) => event.type === "account.rate-limits.updated"),
      Stream.runForEach((event) =>
        Effect.gen(function* () {
          if (!event.providerInstanceId) {
            return;
          }
          const instance = yield* instanceRegistry.getInstance(event.providerInstanceId);
          if (!instance) {
            return;
          }
          const checkedAt = DateTime.formatIso(yield* DateTime.now);
          yield* instance.snapshot.applyUsageLimits({ ...event.payload.limits, checkedAt });
        }).pipe(Effect.ignoreCause({ log: true })),
      ),
      Effect.forkScoped,
    );
  }),
);
