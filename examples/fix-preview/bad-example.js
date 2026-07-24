import { execSync } from "node:child_process";

// Deliberately bad: calls `gh` without ever checking it's installed first —
// exactly the mistake harness-scan's own history caught (see harness-report.md #1).
export function listPullRequests() {
  return execSync("gh pr list").toString();
}
