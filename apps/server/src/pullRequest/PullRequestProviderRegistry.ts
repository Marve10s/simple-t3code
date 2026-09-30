import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { SourceControlProviderKind } from "@t3tools/contracts";

import * as AzureDevOpsCli from "../sourceControl/AzureDevOpsCli.ts";
import * as BitbucketApi from "../sourceControl/BitbucketApi.ts";
import * as GitHubCli from "../sourceControl/GitHubCli.ts";
import * as GitHubGraphQlBudget from "../sourceControl/githubGraphQlBudget.ts";
import * as GitLabCli from "../sourceControl/GitLabCli.ts";
import * as ForgejoCli from "../sourceControl/ForgejoCli.ts";
import * as ForgejoPullRequestProvider from "./ForgejoPullRequestProvider.ts";
import * as AzureDevOpsPullRequestCli from "./AzureDevOpsPullRequestCli.ts";
import * as AzureDevOpsPullRequestProvider from "./AzureDevOpsPullRequestProvider.ts";
import * as BitbucketPullRequestApi from "./BitbucketPullRequestApi.ts";
import * as BitbucketPullRequestProvider from "./BitbucketPullRequestProvider.ts";
import * as GitHubPullRequestCli from "./GitHubPullRequestCli.ts";
import * as GitHubPullRequestProvider from "./GitHubPullRequestProvider.ts";
import * as GitLabPullRequestCli from "./GitLabPullRequestCli.ts";
import * as GitLabPullRequestProvider from "./GitLabPullRequestProvider.ts";
import type { PullRequestProviderApi } from "./PullRequestProvider.ts";

export class PullRequestProviderRegistry extends Context.Service<
  PullRequestProviderRegistry,
  {
    readonly get: (kind: SourceControlProviderKind) => PullRequestProviderApi | null;
    readonly kinds: ReadonlyArray<SourceControlProviderKind>;
  }
>()("t3/pullRequest/PullRequestProviderRegistry") {}

export function fromProviders(
  providers: ReadonlyArray<PullRequestProviderApi>,
): PullRequestProviderRegistry["Service"] {
  const byKind = new Map(providers.map((provider) => [provider.kind, provider]));
  return {
    get: (kind) => byKind.get(kind) ?? null,
    kinds: providers.map((provider) => provider.kind),
  };
}

/** @public */
export const make = Effect.map(
  Effect.all([
    GitHubPullRequestProvider.make,
    GitLabPullRequestProvider.make,
    ForgejoPullRequestProvider.make,
    BitbucketPullRequestProvider.make,
    AzureDevOpsPullRequestProvider.make,
  ]),
  fromProviders,
);

export const layer = Layer.effect(PullRequestProviderRegistry, make).pipe(
  Layer.provide(
    GitHubPullRequestCli.layer.pipe(
      Layer.provide(GitHubCli.layer),
      Layer.provide(GitHubGraphQlBudget.layer),
    ),
  ),
  Layer.provide(GitLabPullRequestCli.layer.pipe(Layer.provide(GitLabCli.layer))),
  Layer.provide(ForgejoCli.layer),
  Layer.provide(BitbucketPullRequestApi.layer.pipe(Layer.provide(BitbucketApi.layer))),
  Layer.provide(AzureDevOpsPullRequestCli.layer.pipe(Layer.provide(AzureDevOpsCli.layer))),
);
