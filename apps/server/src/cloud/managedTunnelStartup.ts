import type { RelayManagedEndpointRuntimeConfig } from "@t3tools/contracts/relay";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";

export type ManagedTunnelRegistrationResult =
  | { readonly status: "not_linked" | "ready" | "unavailable" | "superseded" }
  | {
      readonly status: "recovery_required";
      readonly config: RelayManagedEndpointRuntimeConfig;
    };

export type ManagedTunnelStartupAction =
  | { readonly action: "none" }
  | { readonly action: "reconcile_link" }
  | {
      readonly action: "request_recovery";
      readonly config: RelayManagedEndpointRuntimeConfig;
    };

export function managedTunnelStartupAction(input: {
  readonly wantsCliLink: boolean;
  readonly registration: ManagedTunnelRegistrationResult;
}): ManagedTunnelStartupAction {
  if (input.registration.status === "recovery_required") {
    return {
      action: "request_recovery",
      config: input.registration.config,
    };
  }
  if (input.wantsCliLink && input.registration.status === "not_linked") {
    return { action: "reconcile_link" };
  }
  return { action: "none" };
}

const MANAGED_TUNNEL_REGISTRATION_RETRY_WINDOW = Duration.minutes(10);

export const retryManagedTunnelRegistration = <A, E, R>(
  registration: Effect.Effect<A, E, R>,
  isRetryable: (error: E) => boolean,
  onRetryWindowExhausted?: Effect.Effect<void, never, R>,
) => {
  const schedule = Schedule.exponential("1 second").pipe(
    Schedule.modifyDelay(({ duration }) =>
      Effect.succeed(Duration.min(duration, Duration.seconds(30))),
    ),
    Schedule.jittered,
  );
  const withinWindow = registration.pipe(
    Effect.retry({
      while: isRetryable,
      schedule: schedule.pipe(
        Schedule.upTo({ duration: MANAGED_TUNNEL_REGISTRATION_RETRY_WINDOW }),
      ),
    }),
  );
  if (onRetryWindowExhausted === undefined) return withinWindow;
  return withinWindow.pipe(
    Effect.catchIf(isRetryable, () =>
      onRetryWindowExhausted.pipe(
        Effect.andThen(registration.pipe(Effect.retry({ while: isRetryable, schedule }))),
      ),
    ),
  );
};

export const MANAGED_TUNNEL_RECOVERY_COOLDOWN = Duration.minutes(2);

export const MANAGED_TUNNEL_FIRST_REGISTRATION_JITTER = Duration.seconds(30);
