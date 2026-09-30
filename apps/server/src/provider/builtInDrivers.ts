import { ClaudeDriver, type ClaudeDriverEnv } from "./Drivers/ClaudeDriver.ts";
import { CodexDriver, type CodexDriverEnv } from "./Drivers/CodexDriver.ts";
import { CursorDriver, type CursorDriverEnv } from "./Drivers/CursorDriver.ts";
import { GrokDriver, type GrokDriverEnv } from "./Drivers/GrokDriver.ts";
import { OpenCodeDriver, type OpenCodeDriverEnv } from "./Drivers/OpenCodeDriver.ts";
import { AntigravityDriver, type AntigravityDriverEnv } from "./Drivers/AntigravityDriver.ts";
import type { AnyProviderDriver } from "./ProviderDriver.ts";

export type BuiltInDriversEnv =
  | ClaudeDriverEnv
  | CodexDriverEnv
  | CursorDriverEnv
  | GrokDriverEnv
  | OpenCodeDriverEnv
  | AntigravityDriverEnv;

export const BUILT_IN_DRIVERS: ReadonlyArray<AnyProviderDriver<BuiltInDriversEnv>> = [
  CodexDriver,
  ClaudeDriver,
  CursorDriver,
  GrokDriver,
  OpenCodeDriver,
  AntigravityDriver,
];
