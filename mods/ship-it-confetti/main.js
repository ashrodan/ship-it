// Ship it · Confetti: paper falls over the whole window when a pull request
// ships. The strip opens it as a frameless window as big as the app's; it
// closes itself when the paper has fallen, or at once on a press.
//
// Each piece is drawn twice by the script: once above the top edge, once at
// its landing place. The fall between the two is a native transition, so no
// timer redraws the window while it runs.

import { View, div } from "gpui-kit";
import { props, closeOverlay, theme } from "herdr";

import { pieces, FALL } from "./pieces.js";

export default class Confetti extends View {
  init(_props, cx) {
    this.pieces = pieces();
    this.size = null; this.fall = false;
    cx.timer.after(FALL + 200, () => this.close());
  }

  close() { closeOverlay(props()?.overlay); }

  piece(p, t) {
    const { width, height } = this.size, fall = this.fall;
    const move = { duration: p.duration, delay: p.delay, easing: "ease-in" };
    return div().id(p.id).absolute().w(p.w).h(p.h).rounded(p.round ? 5 : 1).bg(t[p.color] ?? t.accent)
      .left(Math.round((p.x + (fall ? p.drift : 0)) * width)).top(fall ? Math.round(p.land * height) : -12).opacity(fall ? 0 : 1)
      .transition("left", { ...move, easing: "ease-out" }).transition("top", move)
      .transition("opacity", { duration: Math.round(p.duration * 0.4), delay: p.delay + Math.round(p.duration * 0.6), easing: "ease-in" });
  }

  render(cx) {
    const t = theme();
    return div().id("ship-it-confetti").relative().size_full().overflow_hidden()
      .on_size_change((size, cx) => {
        const first = !this.size;
        this.size = size; cx.notify();
        // One draw at the top first: a transition animates a change, not a first value.
        if (first) cx.timer.after(40, (cx) => { this.fall = true; cx.notify(); });
      })
      .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); this.close(); })
      .children(this.size ? this.pieces.map((p) => this.piece(p, t)) : []);
  }
}
