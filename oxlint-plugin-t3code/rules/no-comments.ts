import { defineRule } from "@oxlint/plugins";

const DIRECTIVE =
  /^[\s*]*(eslint-|oxlint-|@ts-(expect-error|ignore|nocheck|check)\b|@effect-diagnostics|@vite-ignore|[@#]__(PURE|NO_SIDE_EFFECTS)__|@vitest-environment|@jsx|webpack[A-Z]|prettier-ignore|oxfmt-ignore|(istanbul|c8|v8) ignore|@license|@preserve)/;
const JSDOC_TYPE =
  /@(type|typedef|callback|template|satisfies|import)\b|@(param|returns?|property|prop)\s*\{/;
const TOOL_TAG = /^@(effect-[\w-]+|public|internal|deprecated|alpha|beta)$/;
const LICENSE_BLOCK =
  /(?:^|\n)[\s*]*(?:Copyright\s+(?:\([cC]\)|©|\d{4})|SPDX-License-Identifier:|(?:The )?(?:MIT|Apache|BSD|ISC|Mozilla Public|GNU[^\n]*) License\b)/i;

export default defineRule({
  meta: {
    type: "problem",
    docs: { description: "Disallow explanatory comments in code." },
    schema: [],
    messages: {
      forbidden:
        "Remove this comment. Keep only required tool directives, licenses, JavaScript types, or bare tool tags.",
    },
  },
  create(context) {
    const plainJs = /\.[cm]?jsx?$/.test(context.filename);

    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (comment.type === "Shebang") continue;
          if (comment.type === "Block" && comment.value.startsWith("!")) continue;
          if (comment.type === "Block" && LICENSE_BLOCK.test(comment.value)) continue;
          if (comment.type === "Line" && /^\/\s*<(reference|amd-module)/.test(comment.value))
            continue;
          if (DIRECTIVE.test(comment.value)) continue;
          if (plainJs && comment.type === "Block" && JSDOC_TYPE.test(comment.value)) continue;

          const lines = comment.value
            .split("\n")
            .map((line) => line.replace(/^\s*\*?\s*/, "").trim())
            .filter(Boolean);
          if (
            comment.type === "Block" &&
            lines.length > 0 &&
            lines.every((line) => TOOL_TAG.test(line))
          )
            continue;

          context.report({ node: comment, messageId: "forbidden" });
        }
      },
    };
  },
});
