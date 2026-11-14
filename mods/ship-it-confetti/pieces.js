// The paper of one throw (mods/ship-it-confetti/main.js draws it).

// How long the slowest piece takes to land, in ms, its wait included.
export const FALL = 2600;
const PIECES = 140;
const COLORS = ["ansi1", "ansi2", "ansi3", "ansi4", "ansi5", "ansi6", "accent"];

// A piece: where it starts and lands (shares of the window's width and
// height), its shape and theme colour, and when it leaves. Made once per
// throw, so the draw above the window and the draw at the landing place agree.
export function pieces(n = PIECES, random = Math.random) {
  return Array.from({ length: n }, (_, i) => {
    const x = random(), wide = random() < 0.5;
    return {
      id: `piece-${i}`, color: COLORS[i % COLORS.length],
      x, drift: (random() - 0.5) * 0.18, land: 0.45 + random() * 0.6,
      w: wide ? 12 : 7, h: wide ? 6 : 12, round: random() < 0.25,
      delay: Math.round(random() * 600), duration: Math.round(1300 + random() * (FALL - 1900)),
    };
  });
}
