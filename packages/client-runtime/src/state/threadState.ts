import type { OrchestrationThread } from "@t3tools/contracts";
import * as Option from "effect/Option";

export type EnvironmentThreadStatus = "empty" | "cached" | "synchronizing" | "live" | "deleted";

export interface EnvironmentThreadPageState {
  readonly beforeCursor: string | null;
  readonly hasMore: boolean;
  readonly loadingOlder: boolean;
}

export interface EnvironmentThreadState {
  readonly data: Option.Option<OrchestrationThread>;
  readonly status: EnvironmentThreadStatus;
  readonly error: Option.Option<string>;
  readonly page: Option.Option<EnvironmentThreadPageState>;
}

export const EMPTY_ENVIRONMENT_THREAD_STATE: EnvironmentThreadState = {
  data: Option.none(),
  status: "empty",
  error: Option.none(),
  page: Option.none(),
};

export function threadHasOlderTurns(state: EnvironmentThreadState): boolean {
  return Option.match(state.page, {
    onNone: () => false,
    onSome: (page) => page.hasMore,
  });
}
