#!/usr/bin/env python3
"""Adds Ship it's three blocks to a Herdr layout, once.

    scripts/add-to-layout.py <layouts/name.json>

- The strip (`ship-it`, 40px) goes right after the tab bar (the block that
  shows the `tabs` mod), in the same column.
- The PR changes and Pull requests panels go into the `panel-body` stack,
  after `changes`.

Blocks that are already there are left alone. The file is backed up to
<name>.json.before-ship-it first. Nothing else in the layout changes.
"""
import json, shutil, sys

STRIP = {"id": "ship-it", "type": "block", "size": {"px": 40}, "content": {"mod": "ship-it"}}
PANELS = [
    {"id": "ship-it-changes", "type": "block", "content": {"mod": "ship-it-changes"}},
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
        print("  panels: no 'panel-body' stack found; PR changes and PRs will hide")
    else:
        kids = body.setdefault("children", [])
        at = next((i + 1 for i, c in enumerate(kids) if c.get("id") == "changes"), len(kids))
        for block in PANELS:
            if block["id"] not in ids:
                kids.insert(at, block)
                at += 1
                done.append(f"{block['id']} panel")

    if not done:
        print("  layout already has Ship it's blocks")
        return
    shutil.copyfile(path, path + ".before-ship-it")
    with open(path, "w") as f:
        json.dump(layout, f, indent=2)
        f.write("\n")
    print("  added: " + ", ".join(done) + f" (backup: {path}.before-ship-it)")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
