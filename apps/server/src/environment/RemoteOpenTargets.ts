import { type RemoteOpenTarget } from "@t3tools/contracts";
import { HostProcessHostname } from "@t3tools/shared/hostProcess";
import * as NetService from "@t3tools/shared/Net";
import { readTailscaleStatus } from "@t3tools/tailscale";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

const SSH_PORT = 22;

export class RemoteOpenTargets extends Context.Service<
  RemoteOpenTargets,
  {
    readonly resolveTargets: () => Effect.Effect<ReadonlyArray<RemoteOpenTarget>>;
  }
>()("t3/environment/RemoteOpenTargets") {}

/** @public */
export const make = Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const net = yield* NetService.NetService;

  const resolveTargets = Effect.gen(function* () {
    const sshdListening = yield* Effect.zipWith(
      net.hasListenerOnHost(SSH_PORT, "127.0.0.1"),
      net.hasListenerOnHost(SSH_PORT, "::1"),
      (ipv4, ipv6) => ipv4 || ipv6,
    );
    if (!sshdListening) {
      return [];
    }

    const targets: Array<RemoteOpenTarget> = [];

    const magicDnsName = yield* readTailscaleStatus.pipe(
      Effect.map((status) => status.magicDnsName),
      Effect.orElseSucceed(() => null),
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
    );
    if (magicDnsName !== null) {
      targets.push({ kind: "tailscale", host: magicDnsName });
    }

    const hostname = yield* HostProcessHostname;
    const shortHostname = hostname.split(".")[0]?.trim();
    if (shortHostname !== undefined && shortHostname.length > 0) {
      targets.push({ kind: "mdns", host: `${shortHostname}.local` });
    }

    return targets;
  });

  return RemoteOpenTargets.of({ resolveTargets: () => resolveTargets });
});

export const layer = Layer.effect(RemoteOpenTargets, make);
