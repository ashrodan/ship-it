#!/usr/bin/env python3
"""Adds Ship it's four blocks to a Herdr layout, once.

    scripts/add-to-layout.py <layouts/name.json>

- The strip (`ship-it`, 40px) goes right after the tab bar (the block that
  shows the `tabs` mod), in the same column.
- The Changes panel (`ship-it-changes`: uncommitted, with a commit box, and
  since the base) takes the place of Herdr's own in the `changes` block, so
  the tab bar's Changes button opens it. A `ship-it-changes` block from an
  older install is removed. Without a `changes` block it gets its own.
- The review and Pull requests panels go into the `panel-body` stack, after
  `changes`.

Blocks that are already there are left alone. The file is backed up to
<name>.json.before-ship-it first (only the first time, so it stays the
layout from before Ship it); a later change to a layout that has that backup
is backed up once to <name>.json.before-ship-it-changes. Nothing else in the
layout changes.
"""
import json, os, shutil, sys

STRIP = {"id": "ship-it", "type": "block", "size": {"px": 40}, "content": {"mod": "ship-it"}}
PANELS = [
    {"id": "ship-it-review", "type": "block", "content": {"mod": "ship-it-review"}},
    {"id": "ship-it-prs", "type": "block", "content": {"mod": "ship-it-prs"}},
]


def walk(node, parent=None):
    yield node, parent
    for child in node.get("children", []) or []:
        yield from walk(child, node)


def main(path):
    with open(path) as f:
        layout = json.load(f)
    root = layout.get("root", layout)
    nodes = list(walk(root))
    ids = {n.get("id") for n, _ in nodes}
    done = []

    if "ship-it" not in ids:
        tabs = next(((n, p) for n, p in nodes if (n.get("content") or {}).get("mod") == "tabs" and p), None)
        if not tabs or tabs[1].get("type") != "column":
            print("  strip: no tab bar block (mod 'tabs') at the top of a column; add it by hand (see README)")
        else:
            node, parent = tabs
            siblings = parent["children"]
            siblings.insert(siblings.index(node) + 1, STRIP)
            done.append("strip after the tab bar")

    body = next((n for n, _ in nodes if n.get("id") == "panel-body"), None)
    if not body:
        print("  panels: no 'panel-body' stack found; PR changes and PRs will hide, and the review opens as a pane")
    else:
        kids = body.setdefault("children", [])
        changes = next((c for c in kids if c.get("id") == "changes"), None)
        if changes:
            if (changes.get("content") or {}).get("mod") != "ship-it-changes":
                changes["content"] = {"mod": "ship-it-changes"}
                done.append("Changes panel in the changes block")
            old = [c for c in kids if c.get("id") == "ship-it-changes"]
            for c in old:
                kids.remove(c)
            if old:
                done.append("old ship-it-changes block removed")
                if body.get("active") == "ship-it-changes":
                    body["active"] = "changes"
        elif "ship-it-changes" not in ids:
            kids.append({"id": "ship-it-changes", "type": "block", "content": {"mod": "ship-it-changes"}})
            done.append("ship-it-changes panel")
        at = next((i + 1 for i, c in enumerate(kids) if c.get("id") == "changes"), len(kids))
        for block in PANELS:
            if block["id"] not in ids:
                kids.insert(at, block)
                at += 1
                done.append(f"{block['id']} panel")

    if not done:
        print("  layout already has Ship it's blocks")
        return
    # The first backup is the layout before Ship it: never overwrite it.
    backup = path + ".before-ship-it"
    if os.path.exists(backup):
        backup = path + ".before-ship-it-changes"
    if not os.path.exists(backup):
        shutil.copyfile(path, backup)
    with open(path, "w") as f:
        json.dump(layout, f, indent=2)
        f.write("\n")
    print("  changed: " + ", ".join(done) + f" (backup: {backup})")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
