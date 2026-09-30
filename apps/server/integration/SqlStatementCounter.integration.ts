import * as Tracer from "effect/Tracer";

export interface SqlStatementCounter {
  readonly tracer: Tracer.Tracer;
  readonly count: () => number;
}

export function makeSqlStatementCounter(): SqlStatementCounter {
  let statements = 0;
  const tracer = Tracer.make({
    span: (options) => {
      if (options.name === "sql.execute") statements += 1;
      return new Tracer.NativeSpan(options);
    },
  });
  return { tracer, count: () => statements };
}
