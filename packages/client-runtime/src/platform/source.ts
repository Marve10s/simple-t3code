import * as Context from "effect/Context";
import type * as Stream from "effect/Stream";

import type { PlatformConnectionRegistration } from "../connection/catalog.ts";

export class PlatformConnectionSource extends Context.Service<
  PlatformConnectionSource,
  {
    readonly registrations: Stream.Stream<ReadonlyArray<PlatformConnectionRegistration>>;
  }
>()("@t3tools/client-runtime/platform/source/PlatformConnectionSource") {}
