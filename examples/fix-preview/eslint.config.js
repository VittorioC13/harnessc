import { noUncheckedCliExecRule } from "./no-unchecked-cli-exec.js";

export default [
  {
    languageOptions: { ecmaVersion: "latest", sourceType: "module" },
    plugins: { "fix-preview": { rules: { "no-unchecked-cli-exec": noUncheckedCliExecRule } } },
    rules: { "fix-preview/no-unchecked-cli-exec": "error" },
  },
];
