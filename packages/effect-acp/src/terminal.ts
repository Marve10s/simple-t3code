import * as Effect from "effect/Effect";

import type * as AcpSchema from "./_generated/schema.gen.ts";
import type * as AcpError from "./errors.ts";

export interface AcpTerminal {
  readonly sessionId: string;
  readonly terminalId: string;
  readonly output: Effect.Effect<AcpSchema.TerminalOutputResponse, AcpError.AcpError>;
  readonly waitForExit: Effect.Effect<AcpSchema.WaitForTerminalExitResponse, AcpError.AcpError>;
  readonly kill: Effect.Effect<AcpSchema.KillTerminalResponse, AcpError.AcpError>;
  readonly release: Effect.Effect<AcpSchema.ReleaseTerminalResponse, AcpError.AcpError>;
}
