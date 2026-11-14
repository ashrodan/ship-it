// What a launch asks GitHub while the rocket waits: how the repo merges, and
// whether the base branch's rules block this pull request for this person.

export const MERGE_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    squashMergeAllowed mergeCommitAllowed rebaseMergeAllowed
    pullRequest(number: $number) { mergeStateStatus viewerCanMergeAsAdmin }
  }
}`;

// repo: the query's `repository`, or null when the question failed (then the
// merge goes ahead as a plain squash, and GitHub has the last word).
//   method   squash, else merge, else rebase: the first the repo allows
//   override the rules block the merge, and this person may bypass them
//            (`gh pr merge --admin`): only after they confirm it
//   refuse   the rules block the merge, and this person can't bypass them
export function mergePlan(repo) {
  const pr = repo?.pullRequest ?? {};
  const method = repo?.squashMergeAllowed !== false ? "squash" : repo?.mergeCommitAllowed ? "merge" : "rebase";
  const blocked = pr.mergeStateStatus === "BLOCKED";
  return { method, override: blocked && pr.viewerCanMergeAsAdmin === true, refuse: blocked && pr.viewerCanMergeAsAdmin !== true };
}
