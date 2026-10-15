// Where is the ONE bubble at time t? Pure math (no Remotion) so it can be tested on its own.
export type Item = {text: string; from: number; to: number; center: string};
export type Blob =
  | {kind: "cell"; k: number; o: number; sc: number} // o: 0 = ball, 1 = full bubble; sc: pop-in/out scale
  | {kind: "thread"; k: number; p: number}; // flowing from cell k to cell k+1, p = 0..1

export const EXIT = 0.05; // seconds the words take to fade out
const OPEN0 = 0.15; // first bubble opens this long before its words start
const POP = 0.15; // first ball pops in this long before that
const CYCLE = 0.5; // wanted time between "words gone" and "next words start" (shrinks if the captions are closer)
const END_HOLD = 0.6; // last words stay this long after they are fully in

const ease = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2; // in-out cubic
};

// out = words fully gone; W = time left until the next words start (closing 25%, travel 50%, opening 25%)
export const schedule = (items: Item[]) =>
  items.map((it, i) => {
    const next = items[i + 1];
    const out = next ? Math.max(it.to + EXIT, next.from - CYCLE) : it.to + END_HOLD;
    const W = next ? Math.max(next.from - out, 0.02) : 0;
    return {out, W};
  });

export const blobAt = (t: number, items: Item[], sch: {out: number; W: number}[]): Blob | null => {
  const f0 = items[0].from - OPEN0;
  if (t < f0 - POP) return null;
  if (t < f0) return {kind: "cell", k: 0, o: 0, sc: ease((t - (f0 - POP)) / POP)};
  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    const s = sch[k];
    const last = k === items.length - 1;
    const openStart = k === 0 ? f0 : sch[k - 1].out + 0.75 * sch[k - 1].W;
    if (t >= openStart && t < it.from) return {kind: "cell", k, o: ease((t - openStart) / (it.from - openStart)), sc: 1};
    if (t >= it.from && t < s.out) return {kind: "cell", k, o: 1, sc: 1};
    if (last) {
      if (t < s.out + 0.15) return {kind: "cell", k, o: 1 - ease((t - s.out) / 0.15), sc: 1};
      if (t < s.out + 0.3) return {kind: "cell", k, o: 0, sc: 1 - ease((t - s.out - 0.15) / 0.15)};
      return null;
    }
    if (t < s.out + 0.25 * s.W) return {kind: "cell", k, o: 1 - ease((t - s.out) / (0.25 * s.W)), sc: 1};
    if (t < s.out + 0.75 * s.W) return {kind: "thread", k, p: (t - s.out - 0.25 * s.W) / (0.5 * s.W)};
  }
  return null;
};