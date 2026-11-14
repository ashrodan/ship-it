// The confetti's paper (mods/ship-it-confetti/pieces.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { pieces, FALL } from "../mods/ship-it-confetti/pieces.js";

test("every piece lands before the window closes, with its own id and a theme colour", () => {
  for (const random of [() => 0, () => 0.5, () => 0.999999, Math.random]) {
    const all = pieces(140, random);
    assert.equal(new Set(all.map((p) => p.id)).size, 140);
    for (const p of all) {
      assert.ok(p.delay + p.duration <= FALL, `${p.delay} + ${p.duration}`);
      assert.ok(p.x >= 0 && p.x < 1 && p.land >= 0.45 && p.land <= 1.05 && Math.abs(p.drift) <= 0.09);
      assert.match(p.color, /^(ansi[1-6]|accent)$/);
    }
  }
});
