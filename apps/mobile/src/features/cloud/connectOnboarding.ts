import { Atom } from "effect/unstable/reactivity";

import { appAtomRegistry } from "../../state/atom-registry";

export const connectOnboardingRequestAtom = Atom.make<string | null>(null).pipe(
  Atom.keepAlive,
  Atom.withLabel("mobile:connect-onboarding-request"),
);

export function requestConnectOnboarding(accountId: string): void {
  appAtomRegistry.set(connectOnboardingRequestAtom, accountId);
}

export function clearConnectOnboardingRequest(): void {
  appAtomRegistry.set(connectOnboardingRequestAtom, null);
}
