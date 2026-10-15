import {useMemo} from "react";
import {AbsoluteFill, Easing, interpolate, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig} from "remotion";
import {loadFont} from "@remotion/google-fonts/Poppins"; // same font as before
import {cellRect} from "./gridCell";

const {fontFamily} = loadFont("normal", {weights: ["800"]});

export const VIDEO2 = "noor.mp4"; // file in /public

// ---- Look ----
const N = 15; // 15x15 grid
const MAIN = "#392F29"; // main text color (used most)
const MID = "#65483c"; // text shadow
const TAN = "#B89870"; // outline + accent letters
const SAGE = "#93886d"; // glow
const ADV = 0.62; // letter width as a fraction of font size
const SMALL = 0.4; // text size in cells
const NAME_SIZE = 0.4; // name label size in cells
const EXIT = 0.05; // seconds a word takes to fade out
const TILT = 9; // degrees for the slightly slanted texts

// ---- Zooms: each one zooms toward the center of its cells; scale is the total zoom reached, then held ----
const ZOOMS = [
  {from: 1.33, to: 1.945, scale: 1.12, cells: ["B4", "C4", "B13", "C13"]},
  {from: 7.229, to: 7.552, scale: 1.24, cells: ["B5", "C5", "B12", "C12"]},
  {from: 10.301, to: 10.658, scale: 1.395, cells: ["B6", "C6", "B11", "C11"]}, // 1.24 x 1.125 = half of the earlier 25% step
];
const ZOOM_TIMES = ZOOMS.flatMap((z) => [z.from, z.to]);
const ZOOM_SCALES = (() => {
  let prev = 1;
  return ZOOMS.flatMap((z) => {
    const pair = [prev, z.scale];
    prev = z.scale;
    return pair;
  });
})();

// ---- Arrow: draws slowly during the same window as the name ----
const ARROW_TO = "B6";
const ARROW_FROM = "E6"; // arrow starts just left of this cell, name sits to its right

// ---- ASCII loading circle: fills clockwise over the whole video ----
const LOADER_CELLS = ["I3", "L3", "I7", "L7"]; // corners of its box; the circle fits inside
const LOADER_END = 21.73; // seconds: fully loaded
const LOADER_CHARS = 24; // characters across the circle

const STAY = 999; // out = STAY keeps a text until the end

type Item = {
  text: string; // multi-word text stacks one word per line
  from: number; // fade-in starts
  to: number; // fade-in finished
  out?: number; // empty = disappears 0.05s before the next item (last one stays)
  center: string[]; // centered on the middle of these cells
  size: number; // font size in cells
  tilt?: number; // slant in degrees
  letterByLetter?: boolean; // letters appear one at a time across from..to
  startAtCell?: boolean; // left-align at the left edge of the first cell instead of centering
};

const RAW: Item[] = [
  {text: "Kyrena Maria Heier", from: 1.33, to: 1.945, center: [ARROW_FROM], size: NAME_SIZE, startAtCell: true},
  {text: "wave", from: 2.894, to: 3.133, center: ["A5", "B5"], size: SMALL},
  {text: "wave", from: 3.427, to: 3.719, center: ["B6", "C6"], size: SMALL},
  {text: "feet open", from: 4.589, to: 4.792, center: ["C13", "D13"], size: SMALL},
  {text: "turn", from: 5.137, to: 5.441, center: ["A5", "B5"], size: SMALL},
  {text: "cross hands", from: 6.137, to: 6.366, center: ["B8", "C8"], size: SMALL},
  {text: "push left", from: 6.622, to: 6.794, center: ["C6"], size: SMALL},
  {text: "relax", from: 7.229, to: 7.552, center: ["C9"], size: SMALL},
  {text: "kick", from: 8.331, to: 8.54, center: ["A10"], size: SMALL},
  {text: "kick", from: 8.69, to: 8.899, center: ["B12"], size: SMALL}, // start not given: same length as the first kick
  {text: "hands up", from: 9.149, to: 9.424, center: ["B4", "C4"], size: SMALL, out: 10.251}, // stays so "x2" can sit beside it
  {text: "x2", from: 9.888, to: 10.008, center: ["C4", "D4"], size: SMALL}, // end not given: short fade
  // from here: alternating straight / slanted
  {text: "swipe left", from: 10.301, to: 10.658, center: ["D7"], size: SMALL},
  {text: "turn", from: 11.17, to: 11.722, center: ["B4"], size: SMALL, tilt: TILT},
  {text: "hands", from: 11.808, to: 12.06, center: ["B4"], size: SMALL},
  {text: "push back", from: 12.51, to: 12.9, center: ["C5"], size: SMALL, tilt: -TILT},
  {text: "lean forward", from: 12.9, to: 13.352, center: ["A6"], size: SMALL},
  {text: "turn and kick", from: 13.352, to: 14.121, center: ["D5"], size: SMALL, tilt: TILT},
  {text: "leg down", from: 14.121, to: 14.303, center: ["C11"], size: SMALL},
  {text: "circle", from: 14.583, to: 15.25, center: ["D5"], size: SMALL, letterByLetter: true, tilt: -TILT},
  {text: "circle", from: 15.476, to: 16.031, center: ["D6"], size: SMALL, letterByLetter: true},
  {text: "circle", from: 16.031, to: 16.526, center: ["C5"], size: SMALL, letterByLetter: true, tilt: TILT},
  {text: "punch up", from: 16.657, to: 16.771, center: ["C3"], size: SMALL},
  {text: "shoulder turn", from: 17.372, to: 17.712, center: ["C5"], size: SMALL, tilt: -TILT},
  {text: "pull towards you", from: 18.029, to: 18.216, center: ["B4"], size: SMALL},
  {text: "pull leg back", from: 19.077, to: 19.327, center: ["C12"], size: SMALL, tilt: TILT},
  {text: "pull leg back", from: 19.765, to: 19.951, center: ["C12"], size: SMALL, out: 20.358}, // stays with its x2
  {text: "x2", from: 19.765, to: 19.951, center: ["D12"], size: SMALL},
  {text: "pull leg back", from: 20.408, to: 20.691, center: ["C12"], size: SMALL, tilt: -TILT, out: STAY},
  {text: "x3", from: 20.408, to: 20.691, center: ["D12"], size: SMALL, tilt: -TILT, out: STAY},
];

// Default exit: 0.05s before the next text (but never before this text has finished fading in)
const ITEMS: Item[] = RAW.map((it, i) => {
  const next = RAW[i + 1];
  return {...it, out: it.out ?? (next ? Math.max(next.from - 0.05, it.to + EXIT) : undefined)};
});

// Pixel position of every letter (words become stacked lines)
const layout = (it: Item, w: number, h: number) => {
  const cw = w / N;
  const font = it.size * cw;
  const rects = it.center.map((c) => cellRect(c, w, h, N));
  const cx = rects.reduce((s, r) => s + r.cx, 0) / rects.length;
  const cy = rects.reduce((s, r) => s + r.cy, 0) / rects.length;
  const lines = it.text.split(" ");
  const lineH = font * 1.15;

  const letters: {ch: string; x: number; y: number}[] = [];
  lines.forEach((line, li) => {
    const chars = Array.from(line);
    const y = cy + (li - (lines.length - 1) / 2) * lineH;
    chars.forEach((ch, i) => {
      const x = it.startAtCell ? rects[0].x + (i + 0.5) * font * ADV : cx + (i - (chars.length - 1) / 2) * font * ADV;
      letters.push({ch, x, y});
    });
  });

  // exact cell positions; only nudged if the text would be cut off by the frame edge
  const half = (font * ADV) / 2;
  const minX = Math.min(...letters.map((l) => l.x)) - half;
  const maxX = Math.max(...letters.map((l) => l.x)) + half;
  const shift = minX < 0 ? -minX : maxX > w ? w - maxX : 0;
  letters.forEach((l) => (l.x += shift));

  console.log(`[DanceEdit2] "${it.text}" on ${it.center.join("+")} font=${font.toFixed(0)}px lines=${lines.length} edge-shift=${shift.toFixed(0)}px`);
  return {letters, font, bx: cx + shift, by: cy};
};

export const DanceEdit2 = () => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const t = frame / fps;
  const clamp = {extrapolateLeft: "clamp", extrapolateRight: "clamp"} as const;

  const geo = useMemo(() => {
    const cw = width / N;
    const mid = (cells: string[]) => {
      const r = cells.map((c) => cellRect(c, width, height, N));
      return {x: r.reduce((s, q) => s + q.cx, 0) / r.length, y: r.reduce((s, q) => s + q.cy, 0) / r.length};
    };
    const origins = ZOOMS.map((z) => mid(z.cells));
    const b6 = cellRect(ARROW_TO, width, height, N);
    const e6 = cellRect(ARROW_FROM, width, height, N);
    const tip = {x: b6.x + b6.w * 0.8, y: b6.cy};
    const tail = {x: e6.x - cw * 0.15, y: e6.cy};
    const ctrl = {x: (tip.x + tail.x) / 2, y: tail.y - cw * 0.6}; // slight upward bow
    const angle = (Math.atan2(tip.y - ctrl.y, tip.x - ctrl.x) * 180) / Math.PI;
    console.log(`[DanceEdit2] zoom origins ${origins.map((o) => `${o.x.toFixed(0)},${o.y.toFixed(0)}`).join(" | ")} | arrow ${ARROW_FROM}->${ARROW_TO}`);
    // ASCII loader: characters on a grid, kept where they fall inside the circle
    const lr = LOADER_CELLS.map((c) => cellRect(c, width, height, N));
    const bx0 = Math.min(...lr.map((q) => q.x));
    const bx1 = Math.max(...lr.map((q) => q.x + q.w));
    const by0 = Math.min(...lr.map((q) => q.y));
    const by1 = Math.max(...lr.map((q) => q.y + q.h));
    const D = Math.min(bx1 - bx0, by1 - by0);
    const lcx = (bx0 + bx1) / 2;
    const lcy = (by0 + by1) / 2;
    const cols = LOADER_CHARS;
    const rows = Math.round(cols * 0.6); // characters are taller than wide
    const dots: {x: number; y: number; ring: boolean; f: number; k: number}[] = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const nx = ((c + 0.5) / cols) * 2 - 1;
        const ny = ((r + 0.5) / rows) * 2 - 1;
        const rad = Math.hypot(nx, ny);
        if (rad > 1 || rad < 0.32) continue; // circle only, hole in the middle for the percentage
        let a = Math.atan2(nx, -ny); // 0 at the top, clockwise
        if (a < 0) a += 2 * Math.PI;
        dots.push({x: lcx + (nx * D) / 2, y: lcy + (ny * D) / 2, ring: rad > 0.78, f: a / (2 * Math.PI), k: r + c});
      }
    console.log(`[DanceEdit2] loader box ${LOADER_CELLS.join(",")} -> circle ${D.toFixed(0)}px at ${lcx.toFixed(0)},${lcy.toFixed(0)} with ${dots.length} characters`);
    const loader = {dots, font: (D / cols) * 1.25, lcx, lcy, D};

    return {cw, origins, tip, tail, ctrl, angle, loader, laid: ITEMS.map((it) => layout(it, width, height))};
  }, [width, height]);

  ZOOMS.forEach((z, k) => {
    if (frame === Math.round(z.from * fps)) console.log(`[DanceEdit2] zoom ${k + 1} starts ${z.from}s -> ${z.scale}x`);
    if (frame === Math.round(z.to * fps)) console.log(`[DanceEdit2] zoom ${k + 1} ends ${z.to}s (holds at ${z.scale}x)`);
  });

  const zoom = interpolate(t, ZOOM_TIMES, ZOOM_SCALES, {...clamp, easing: Easing.inOut(Easing.cubic)});
  let origin = geo.origins[0]; // focus point glides from one zoom's center to the next
  ZOOMS.forEach((z, k) => {
    if (k === 0) return;
    const p = interpolate(t, [z.from, z.to], [0, 1], clamp);
    origin = {x: origin.x + (geo.origins[k].x - origin.x) * p, y: origin.y + (geo.origins[k].y - origin.y) * p};
  });

  // Arrow (same window as the name)
  const first = ITEMS[0];
  const draw = interpolate(t, [first.from, first.to], [0, 1], {...clamp, easing: Easing.inOut(Easing.cubic)});
  const headOn = interpolate(draw, [0.85, 1], [0, 1], clamp);
  const arrowOut = first.out !== undefined ? interpolate(t, [first.out - EXIT, first.out], [1, 0], clamp) : 1;
  const lw = geo.cw * 0.09;
  const arrowPath = `M ${geo.tail.x} ${geo.tail.y} Q ${geo.ctrl.x} ${geo.ctrl.y} ${geo.tip.x} ${geo.tip.y}`;
  const hs = geo.cw * 0.4;

  const prog = interpolate(t, [0, LOADER_END], [0, 1], clamp); // loader progress 0..1
  if (frame % 30 === 0) console.log(`[DanceEdit2] loader ${Math.round(prog * 100)}%`);

  return (
    <AbsoluteFill style={{background: "black"}}>
      <AbsoluteFill style={{transform: `scale(${zoom})`, transformOrigin: `${origin.x}px ${origin.y}px`}}>
        <OffthreadVideo src={staticFile(VIDEO2)} style={{width, height}} />
      </AbsoluteFill>

      <svg width={width} height={height} style={{position: "absolute", inset: 0}}>
        {draw > 0.001 && arrowOut > 0 && (
          <g opacity={arrowOut} style={{filter: `drop-shadow(0 0 ${lw}px ${SAGE})`}}>
            <path d={arrowPath} fill="none" stroke={TAN} strokeWidth={lw * 2.2} strokeLinecap="round" pathLength={1} strokeDasharray={`${draw} 2`} />
            <path d={arrowPath} fill="none" stroke={MAIN} strokeWidth={lw} strokeLinecap="round" pathLength={1} strokeDasharray={`${draw} 2`} />
            <polygon
              points={`0,0 ${-hs},${-hs * 0.6} ${-hs},${hs * 0.6}`}
              fill={MAIN}
              stroke={TAN}
              strokeWidth={lw * 0.6}
              strokeLinejoin="round"
              opacity={headOn}
              transform={`translate(${geo.tip.x} ${geo.tip.y}) rotate(${geo.angle}) scale(${headOn})`}
            />
          </g>
        )}

        <g style={{filter: `drop-shadow(0 0 ${geo.loader.font * 0.25}px ${TAN})`}}>
          {geo.loader.dots.map((d, i) => {
            const on = d.f <= prog;
            const swap = d.k % 3 === 0; // main color most of the time, tan accents between
            return (
              <text
                key={i}
                x={d.x}
                y={d.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontFamily={fontFamily}
                fontWeight={800}
                fontSize={geo.loader.font}
                fill={on ? (swap ? TAN : MAIN) : SAGE}
                stroke={on ? (swap ? MAIN : TAN) : "none"}
                strokeWidth={geo.loader.font * 0.12}
                paintOrder="stroke"
                opacity={on ? 1 : 0.55}
              >
                {d.ring ? (on ? "#" : "o") : on ? "+" : "."}
              </text>
            );
          })}
          <text x={geo.loader.lcx} y={geo.loader.lcy} textAnchor="middle" dominantBaseline="central" fontFamily={fontFamily} fontWeight={800} fontSize={geo.loader.D * 0.14} fill={MAIN} stroke={TAN} strokeWidth={geo.loader.D * 0.02} paintOrder="stroke">
            {Math.round(prog * 100)}%
          </text>
        </g>

        {ITEMS.map((it, k) => {
          const {letters, font, bx, by} = geo.laid[k];
          if (frame === Math.round(it.from * fps)) console.log(`[DanceEdit2] "${it.text}" fades in ${it.from}s -> ${it.to}s`);
          if (it.out !== undefined && frame === Math.round(it.out * fps)) console.log(`[DanceEdit2] "${it.text}" gone at ${it.out.toFixed(3)}s`);
          if (it.out !== undefined && t >= it.out) return null;

          const span = Math.max(it.to - it.from, 0.05);
          const exit = it.out !== undefined ? interpolate(t, [it.out - EXIT, it.out], [1, 0], clamp) : 1;

          return (
            <g key={k} transform={`rotate(${it.tilt ?? 0} ${bx} ${by})`}>
              {letters.map((l, i) => {
                const n = letters.length;
                const t0 = it.letterByLetter ? it.from + (i * span) / n : it.from + (n > 1 ? i / (n - 1) : 0) * 0.4 * span; // soft stagger, or one letter at a time
                const dur = it.letterByLetter ? span / n : 0.6 * span;
                const p = interpolate(t, [t0, t0 + dur], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)}); // info-video fade + small rise
                if (p <= 0) return null;
                const swap = i % 3 === 2; // main color most of the time, tan accents between
                return (
                  <g key={i} opacity={p * exit} transform={`translate(${l.x} ${l.y + (1 - p) * font * 0.25})`}>
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontFamily={fontFamily}
                      fontWeight={800}
                      fontSize={font}
                      fill={swap ? TAN : MAIN}
                      stroke={swap ? MAIN : TAN}
                      strokeWidth={font * 0.13}
                      strokeLinejoin="round"
                      paintOrder="stroke"
                      style={{filter: `drop-shadow(0 0 ${font * 0.14}px ${swap ? SAGE : TAN}) drop-shadow(0 ${font * 0.05}px ${font * 0.08}px ${MID})`}}
                    >
                      {l.ch}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};