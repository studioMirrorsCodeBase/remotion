// src/ComicEdit.tsx
// NEW FILE (to be created). It is src/NatashaComic.tsx with every setting read from the JSON instead of written in the code.

import {useMemo} from "react";
import {AbsoluteFill, Easing, interpolate, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig} from "remotion";
import {loadFont} from "@remotion/google-fonts/ComicNeue"; // the only font the JSON can name for now
import {cellRect} from "./gridCell";
import {blobAt, schedule, type Blob} from "./bubbleTimeline";
import type {Spec} from "./spec";

const {fontFamily} = loadFont("normal", {weights: ["700"]});
const ADV = 0.66; // average capital-letter width as a fraction of font size (only sizes the bubble)

type P = {x: number; y: number};
const bez = (a: P, c: P, b: P, u: number): P => ({
  x: (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * c.x + u * u * b.x,
  y: (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * c.y + u * u * b.y,
});

// Middle of the listed cells, in pixels
const centerOf = (cells: string[], w: number, h: number, n: number): P => {
  const r = cells.map((c) => cellRect(c, w, h, n));
  return {x: r.reduce((s, q) => s + q.cx, 0) / r.length, y: r.reduce((s, q) => s + q.cy, 0) / r.length};
};

// The whole edit is drawn from the JSON ("spec"): the props ARE the JSON, so --props=scripts/x.json works.
// videoSrc is only set by the preview tab (a video picked in the browser); a render uses public/<video.file>.
export const ComicEdit = (spec: Spec & {videoSrc?: string}) => {
  const frame = useCurrentFrame();
  const {fps, width, height, durationInFrames} = useVideoConfig();
  const t = frame / fps;
  const clamp = {extrapolateLeft: "clamp", extrapolateRight: "clamp"} as const;
  const {style, timing: tm, captions, zooms} = spec; // pieces, not "spec" itself: the props object is new on every frame, its pieces are not
  const N = spec.grid.size;

  const sch = useMemo(() => schedule(captions, tm), [captions, tm]);

  const geo = useMemo(() => {
    const cw = width / N;
    const font = style.font.sizeCells * cw;
    const lineH = font * 1.15;
    const items = captions.map((cap) => {
      const c = centerOf(cap.cells, width, height, N);
      const tr = cellRect(cap.tail ?? style.tail.defaultTarget, width, height, N);
      const lines = (style.font.capitals ? cap.text.toUpperCase() : cap.text).split(" "); // one word per line
      const longest = Math.max(...lines.map((l) => l.length));
      const rx = ((longest * font * ADV) / 2) * 1.3 + font * 0.7; // bubble half-width
      const ry = ((lines.length * lineH) / 2) * 1.3 + font * 0.55; // bubble half-height
      console.log(`[Comic] #${cap.id} "${cap.text}" at ${cap.cells.join("+")} bubble ${(rx * 2).toFixed(0)}x${(ry * 2).toFixed(0)}px`);
      return {c, tail: {x: tr.cx, y: tr.cy}, rx, ry, lines};
    });
    // smooth curve from each bubble to the next: control point bows to the upper side
    const hops = items.slice(0, -1).map((a, k) => {
      const b = items[k + 1];
      const len = Math.hypot(b.c.x - a.c.x, b.c.y - a.c.y) || 1;
      let nx = -(b.c.y - a.c.y) / len;
      let ny = (b.c.x - a.c.x) / len;
      if (ny > 0) [nx, ny] = [-nx, -ny];
      const C = {x: (a.c.x + b.c.x) / 2 + nx * len * 0.25, y: (a.c.y + b.c.y) / 2 + ny * len * 0.25};
      console.log(`[Comic] hop ${k + 1}->${k + 2} length ${len.toFixed(0)}px`);
      return {A: a.c, B: b.c, C};
    });
    const zoomList = [...zooms].sort((a, b) => a.from - b.from).map((z) => ({...z, origin: centerOf(z.cells, width, height, N)}));
    return {cw, font, lineH, items, hops, zooms: zoomList};
  }, [captions, style, zooms, N, width, height]);

  // key moments, logged once each
  captions.forEach((cap, k) => {
    const s = sch[k];
    const marks: [string, number][] = [["words in", cap.from], ["words gone", s.out]];
    if (k < captions.length - 1) marks.push(["travel starts", s.out + tm.split.close * s.W], ["travel ends", s.out + (tm.split.close + tm.split.travel) * s.W]);
    marks.forEach(([name, tt]) => frame === Math.round(tt * fps) && console.log(`[Comic] #${cap.id} "${cap.text}" ${name} at ${tt.toFixed(3)}s (frame ${frame})`));
  });

  // zooms stack and hold; the origin is the latest zoom that has started
  let zoom = 1;
  geo.zooms.forEach((z) => (zoom *= 1 + (z.percent / 100) * interpolate(t, [z.from, z.to], [0, 1], {...clamp, easing: Easing.inOut(Easing.cubic)})));
  const live = [...geo.zooms].reverse().find((z) => t >= z.from) ?? geo.zooms[0];
  const origin = live ? live.origin : {x: width / 2, y: height / 2};

  const fade = spec.ending.find((e) => e.type === "fadeToBlack");
  const fadeStart = durationInFrames - (fade ? fade.seconds * fps : 0);
  const endFade = fade ? interpolate(frame, [fadeStart, durationInFrames - 1], [1, 0], clamp) : 1;
  if (fade && frame === Math.round(fadeStart)) console.log(`[Comic] fade to black starts (frame ${frame} of ${durationInFrames})`);

  const blob = blobAt(t, captions, sch, tm);
  const R = geo.cw * style.ballRadiusCells;
  const lw = geo.cw * style.outlineCells;

  // the whole bubble/ball/thread, drawn twice: wide in the ink color (the outline), then in the fill color
  const draw = (b: Blob, color: string, grow: number) => {
    if (b.kind === "cell") {
      const g = geo.items[b.k];
      const rx = (R + (g.rx - R) * b.o) * b.sc + grow * b.sc;
      const ry = (R + (g.ry - R) * b.o) * b.sc + grow * b.sc;

      // comic tail: a thin curved spike from the bubble edge toward the target cell, grows as the bubble opens
      let tail = null;
      if (style.tail.enabled && b.o > 0.02) {
        const dx = g.tail.x - g.c.x;
        const dy = g.tail.y - g.c.y;
        const dist = Math.hypot(dx, dy) || 1;
        const d = {x: dx / dist, y: dy / dist};
        const phi = Math.atan2(g.rx * dy, g.ry * dx); // point of the ellipse that faces the target
        const onEllipse = (a: number, k: number): P => ({x: g.c.x + k * g.rx * Math.cos(a), y: g.c.y + k * g.ry * Math.sin(a)});
        const base = onEllipse(phi, 1);
        const b1 = onEllipse(phi - 0.35, 0.95); // base corners sit slightly inside, so the outline opens into the tail
        const b2 = onEllipse(phi + 0.35, 0.95);
        const L = Math.max(0, Math.min(dist * style.tail.reach, geo.cw * style.tail.maxLengthCells)) * b.o * b.sc;
        const tip = {x: base.x + d.x * L, y: base.y + d.y * L};
        const n = {x: -d.y, y: d.x};
        const c1 = {x: (b1.x + tip.x) / 2 + n.x * L * 0.18, y: (b1.y + tip.y) / 2 + n.y * L * 0.18};
        const c2 = {x: (b2.x + tip.x) / 2 + n.x * L * 0.18, y: (b2.y + tip.y) / 2 + n.y * L * 0.18};
        tail = <path d={`M ${b1.x} ${b1.y} Q ${c1.x} ${c1.y} ${tip.x} ${tip.y} Q ${c2.x} ${c2.y} ${b2.x} ${b2.y} Z`} fill={color} stroke={color} strokeWidth={2 * grow} strokeLinejoin="round" />;
      }
      return (
        <>
          {tail}
          <ellipse cx={g.c.x} cy={g.c.y} rx={rx} ry={ry} fill={color} />
        </>
      );
    }
    const h = geo.hops[b.k];
    const head = Easing.out(Easing.cubic)(b.p); // head runs ahead
    const back = Easing.in(Easing.cubic)(b.p); // tail lags, so the line stretches then gathers
    const th = 1 - 0.55 * Math.sin(Math.PI * b.p); // thinner while stretched
    const steps = Math.max(2, Math.ceil((head - back) * 40));
    const pts = Array.from({length: steps + 1}, (_, i) => bez(h.A, h.C, h.B, back + ((head - back) * i) / steps));
    const hp = bez(h.A, h.C, h.B, head);
    const tp = bez(h.A, h.C, h.B, back);
    return (
      <>
        <path d={`M ${pts.map((p) => `${p.x} ${p.y}`).join(" L ")}`} fill="none" stroke={color} strokeWidth={2 * R * th + 2 * grow} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={tp.x} cy={tp.y} r={R * th + grow} fill={color} />
        <circle cx={hp.x} cy={hp.y} r={R * (0.5 + 0.5 * th) + grow} fill={color} />
      </>
    );
  };

  return (
    <AbsoluteFill style={{background: "black"}}>
      <AbsoluteFill style={{opacity: endFade, transform: `scale(${zoom})`, transformOrigin: `${origin.x}px ${origin.y}px`}}>
        <OffthreadVideo src={spec.videoSrc ?? staticFile(spec.video.file)} style={{width, height}} />
      </AbsoluteFill>

      <svg width={width} height={height} style={{position: "absolute", inset: 0}}>
        {blob && (
          <g>
            {draw(blob, style.ink, lw)}
            {draw(blob, style.fill, 0)}
          </g>
        )}

        {captions.map((cap, k) => {
          const out = sch[k].out;
          if (t < cap.from || t >= out) return null;
          const span = Math.max(cap.to - cap.from, 0.05);
          const exit = interpolate(t, [out - tm.exitFadeSeconds, out], [1, 0], clamp);
          const {c, lines} = geo.items[k];
          return lines.map((line, li) => {
            const t0 = cap.from + (lines.length > 1 ? li / (lines.length - 1) : 0) * 0.4 * span; // soft stagger, one word at a time
            const p = interpolate(t, [t0, t0 + 0.6 * span], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});
            if (p <= 0) return null;
            return (
              <text
                key={`${k}-${li}`}
                x={c.x}
                y={c.y + (li - (lines.length - 1) / 2) * geo.lineH + (1 - p) * geo.font * 0.25}
                opacity={p * exit}
                textAnchor="middle"
                dominantBaseline="central"
                fontFamily={fontFamily}
                fontWeight={700}
                fontSize={geo.font}
                fill={style.ink}
              >
                {line}
              </text>
            );
          });
        })}
      </svg>
    </AbsoluteFill>
  );
};