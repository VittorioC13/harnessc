// v2 preview: what `harness-scan fix` would generate for cluster #1 in harness-report.md
// ("Runs 'gh' command without installing it" — 2x across 2 real sessions).
const EXEC_FUNCTIONS = new Set(["execSync", "spawnSync", "exec", "spawn"]);
const RISKY_TOOLS = ["gh", "codex", "vercel"];

function commandStringOf(node) {
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral") return node.quasis.map((q) => q.value.cooked ?? "").join("");
  return undefined;
}

export const noUncheckedCliExecRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow invoking known external CLI tools via child_process without a preflight installation check.",
    },
    schema: [],
    messages: {
      unchecked:
        "Calling '{{tool}}' via {{fn}}() without checking it's installed first. This exact mistake happened " +
        "2x across 2 real Claude Code sessions (harness-report.md #1: \"Runs 'gh' command without installing " +
        'it\"). Add a preflight check first, e.g.: try { execSync(\'command -v {{tool}}\', { stdio: \'ignore\' }) ' +
        "} catch { /* tell the user how to install it */ }",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        const fnName =
          callee.type === "Identifier"
            ? callee.name
            : callee.type === "MemberExpression" && callee.property.type === "Identifier"
              ? callee.property.name
              : undefined;
        if (!fnName || !EXEC_FUNCTIONS.has(fnName)) return;

        const firstArg = node.arguments[0];
        if (!firstArg) return;
        const command = commandStringOf(firstArg);
        if (!command) return;

        const tool = RISKY_TOOLS.find((t) => command.trim() === t || command.trim().startsWith(`${t} `));
        if (!tool) return;

        context.report({ node, messageId: "unchecked", data: { tool, fn: fnName } });
      },
    };
  },
};
