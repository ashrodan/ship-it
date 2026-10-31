# Ship it

A [Herdr](https://herdr.dev) mod that takes the branch you're working on to a
merged pull request without leaving your terminals.

![Ship it](preview.png)

- **The strip**, under the tab bar, always says where the work is: machine,
  folder, branch (ahead/behind, uncommitted), and the pull request with its
  state, conflicts, checks, open review threads and review decision. It
  follows the pane you're in, across spaces and machines.
- **PR changes** opens the side panel on everything the branch changes since
  its base, uncommitted work included. Double-click a file to read it whole
  in a pane.
- **PRs** lists the repo's open pull requests (All, Mine, To review).
- **Ship** merges the pull request, after a confirm that says how, into what,
  and what still looks wrong (failing checks, no approval, open threads).
- **The review pane** (click the PR on the strip) has three tabs:
  **Overview** (description, conversation, conflicts with a copyable list,
  open threads, a comment box), **Files** (the diff, "viewed" marks, inline
  threads with Reply and Resolve) and **Checks** (failing first, the failed
  log's tail, Re-run failed).

## Requirements

- The Herdr desktop app (`herdr-app`).
- `git`, and the [GitHub CLI](https://cli.github.com) logged in (`gh auth
  login`) for anything about pull requests. Without `gh` the strip still
  shows the folder, branch and changes.
- Remote machines work through Herdr's own `exec`: they need `git` and `gh`
  there too.

## Install

```sh
git clone <this repo> ship-it && cd ship-it
scripts/install.sh
```

That copies the mods into `${HERDR_APP_HOME:-~/.config/herdr-app}/mods/` and
checks each one. Then add three blocks to your own layout (Herdr's shipped
layouts are read-only: clone one under `layouts/` first):

1. The strip, in the work column between the tab bar and the panes:

   ```json
   { "id": "ship-it", "type": "block", "size": { "px": 40 }, "content": { "mod": "ship-it" } }
   ```

2. Two panels, as children of the `panel-body` stack next to `files` and
   `changes`:

   ```json
   { "id": "ship-it-changes", "type": "block", "content": { "mod": "ship-it-changes" } },
   { "id": "ship-it-prs", "type": "block", "content": { "mod": "ship-it-prs" } }
   ```

Without the panel blocks, the PR changes and PRs buttons hide.

## Keys (review pane)

`1` `2` `3` tabs · `r` refresh · `o` open on GitHub · `j`/`k` next/previous
file · `v` viewed · `n` next unviewed · `e` open the file · `⌘↵` post ·
`esc` close a drawer or log. Bindable as commands too
(`ship-it-review.files`, `ship-it-review.next-unviewed`, …).

## What it does on your behalf

Ship it runs `git` and `gh` as you, in the repo you're in. Reading is
side-effect free: git reads skip index refreshes and locks. These write, and
only on a click:

| Action | Runs |
| --- | --- |
| Comment | `gh pr comment` |
| Reply, Resolve, Reopen | GitHub GraphQL review-thread mutations |
| Re-run failed | `gh run rerun --failed` |
| Ship | `gh pr merge --squash` (or `--merge`/`--rebase`, whichever the repo allows) `--match-head-commit <sha>`, after a confirm. A push after the confirm opened makes GitHub refuse. The branch is kept. |
| Create | `gh pr create --web` |

Conflict detection runs `git merge-tree` in memory, only when GitHub reports
a conflict; it writes loose objects to `.git` and nothing else.

## Performance

Herdr redraws the whole window for every mod redraw, so Ship it stays quiet:
it redraws only when what it shows changes, panels and panes that aren't on
screen do no work until they are, a burst of file changes becomes one
refresh, and the review pane reads the diff only when its Files tab shows.

## Layout of this repo

- `mods/ship-it/`: the strip, and `data.js` (git and GitHub facts, shared).
- `mods/ship-it-review/`: the review pane, and `files.js` (the branch diff).
- `mods/ship-it-changes/`, `mods/ship-it-prs/`: the two panels.
- `mods/ship-it-file/`: the read-only file pane.
- `scripts/install.sh`: copies the shared `data.js`, `files.js` and icons
  into the mods that use them (a mod can't import from another), then
  installs. `--sync` only refreshes the copies.
- `RECIPE.md`: the full spec, detailed enough for an agent to rebuild it.

## Credits

Icons from [Lucide](https://lucide.dev) (ISC License).

## License

MIT. See `LICENSE`.
