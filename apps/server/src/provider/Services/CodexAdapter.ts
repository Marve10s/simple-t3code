import type { ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";

export interface CodexAdapterShape extends ProviderAdapterShape<ProviderAdapterError> {
  readonly uploadFeedback: NonNullable<
    ProviderAdapterShape<ProviderAdapterError>["uploadFeedback"]
  >;
}
