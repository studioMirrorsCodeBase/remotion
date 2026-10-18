// app/preview.tsx
// NOT NEW: existing file, changed (waits for the browser-stored video before trying public/, ignores stale results, generous logging, crash shown on the page)

// Tab 2: plays the video with the captions on top (the same ComicEdit that Remotion renders), updates live when the editor tab sends new JSON or a new video.
import {Component, useEffect, useMemo, useState, type ReactNode} from "react";
import {createRoot} from "react-dom/client";
import {Player} from "@remotion/player";
import {getVideoMetadata} from "@remotion/media-utils";
import {staticFile} from "remotion";
import {ComicEdit} from "../src/ComicEdit";
import {validateAgainstVideo, validateSpec, type Spec} from "../src/spec";
import {CHANNEL, DEFAULT_TEXT, loadVideo, STORE_KEY} from "./shared";

console.log("[Preview] 1. file loaded, all imports resolved");

// Any crash is written on the page, not only in the console
const showCrash = (where: string, msg: string) => {
  console.error(`[Preview] CRASH (${where}):`, msg);
  const root = document.getElementById("root");
  if (root) root.innerHTML = `<pre style="color:#ff7a7a;padding:24px;white-space:pre-wrap">Preview crashed (${where}):\n${msg}</pre>`;
};
window.addEventListener("error", (e) => showCrash("window error", `${e.message}\n${e.error?.stack ?? ""}`));
window.addEventListener("unhandledrejection", (e) => showCrash("unhandled promise", String((e.reason && e.reason.stack) || e.reason)));

// React render errors (what makes a page silently white) land here
class Boundary extends Component<{children: ReactNode}, {err: Error | null}> {
  state = {err: null as Error | null};
  static getDerivedStateFromError(err: Error) {
    return {err};
  }
  componentDidCatch(err: Error, info: {componentStack?: string | null}) {
    console.error("[Preview] React render error:", err, info.componentStack);
  }
  render() {
    if (this.state.err) return <pre style={{color: "#ff7a7a", padding: 24, whiteSpace: "pre-wrap"}}>Preview render error:{"\n"}{this.state.err.stack}</pre>;
    return this.props.children;
  }
}

type Meta = {w: number; h: number; seconds: number};
type Uploaded = {url: string; name: string};

const parse = (text: string): {spec?: Spec; errors: string[]} => {
  try {
    const raw = JSON.parse(text);
    const {errors} = validateSpec(raw);
    console.log(`[Preview] parse: ${errors.length} problem(s)`);
    return errors.length ? {errors} : {spec: raw as Spec, errors};
  } catch (e) {
    console.log(`[Preview] parse: JSON syntax error: ${(e as Error).message}`);
    return {errors: [`JSON syntax: ${(e as Error).message}`]};
  }
};

const Preview = () => {
  console.log("[Preview] 3. component rendering");
  const [text, setText] = useState(() => {
    try {
      const saved = localStorage.getItem(STORE_KEY);
      console.log(`[Preview] start JSON from ${saved ? "localStorage (sent by the editor)" : "DEFAULT_TEXT (scripts/natasja.json)"}`);
      return saved ?? DEFAULT_TEXT;
    } catch (e) {
      console.error("[Preview] localStorage failed", e);
      return DEFAULT_TEXT;
    }
  });
  const [uploaded, setUploaded] = useState<Uploaded | null>(null); // the video picked in the editor tab
  const [checked, setChecked] = useState(false); // true once the browser-stored video has been looked for
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaErr, setMetaErr] = useState("");
  const [shown, setShown] = useState<{spec: Spec; meta: Meta; src: string} | null>(null); // last good version stays on screen

  const readUploaded = () => {
    console.log("[Preview] reading the stored video from IndexedDB...");
    return loadVideo()
      .then((f) => {
        console.log(`[Preview] stored video: ${f ? `${f.name}, ${(f.size / 1e6).toFixed(1)} MB, type "${f.type}"` : "none"}`);
        setUploaded(f ? {url: URL.createObjectURL(f), name: f.name} : null);
      })
      .catch((e) => console.error("[Preview] cannot read the stored video", e))
      .finally(() => {
        console.log("[Preview] stored-video check finished");
        setChecked(true);
      });
  };

  useEffect(() => {
    console.log(`[Preview] 4. effect: opening channel "${CHANNEL}" and reading the stored video`);
    readUploaded();
    const ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = (e) => {
      console.log(`[Preview] message from the editor: ${e.data.type}`);
      if (e.data.type === "json") setText(e.data.text);
      if (e.data.type === "video") readUploaded();
    };
    return () => ch.close();
  }, []);
  useEffect(() => () => void (uploaded && URL.revokeObjectURL(uploaded.url)), [uploaded]);

  const parsed = useMemo(() => parse(text), [text]);
  const file = parsed.spec?.video.file;
  const src = uploaded ? uploaded.url : checked && file ? staticFile(file) : ""; // public/ is only tried after the stored video was looked for
  console.log(`[Preview] source: ${uploaded ? `uploaded "${uploaded.name}"` : src ? `public/${file}` : "nothing yet"}`);

  useEffect(() => {
    if (!src) {
      console.log("[Preview] no video source yet, skipping metadata");
      return;
    }
    let stale = false; // a newer source replaced this one: ignore its result
    console.log(`[Preview] 5. reading video metadata from ${src}`);
    setMeta(null);
    setMetaErr("");
    getVideoMetadata(src)
      .then((m) => {
        if (stale) return console.log("[Preview] ignoring a stale metadata result");
        console.log(`[Preview] video ${uploaded ? uploaded.name : file}: ${m.width}x${m.height}, ${m.durationInSeconds.toFixed(3)}s`);
        setMeta({w: m.width, h: m.height, seconds: m.durationInSeconds});
      })
      .catch((e) => {
        if (stale) return console.log("[Preview] ignoring a stale metadata error");
        console.error("[Preview] video metadata failed", e);
        setMetaErr(uploaded ? `Cannot read the chosen video (${e?.message ?? e})` : `No video chosen, and "${file}" is not in the public folder (${e?.message ?? e})`);
      });
    return () => {
      stale = true;
    };
  }, [src]);

  const videoErrors = parsed.spec && meta ? validateAgainstVideo(parsed.spec, meta.seconds) : [];
  const errors = [...parsed.errors, ...videoErrors, ...(metaErr ? [metaErr] : [])];
  if (errors.length) console.log(`[Preview] ${errors.length} problem(s) blocking an update:`, errors);

  useEffect(() => {
    if (parsed.spec && meta && errors.length === 0) {
      console.log("[Preview] 6. everything is valid, showing new version");
      setShown({spec: parsed.spec, meta, src});
    }
  }, [parsed.spec, meta, errors.length]);

  if (!shown) {
    console.log(`[Preview] nothing to show yet (${errors.length ? "errors" : "still loading"})`);
    return <div style={{padding: 24}}>{errors.length ? errors.map((e, i) => <p key={i} style={{color: "#ff7a7a"}}>{e}</p>) : "Loading the video..."}</div>;
  }
  const {spec, meta: m} = shown;
  console.log(`[Preview] 7. rendering the Player: ${m.w}x${m.h}, ${spec.fps}fps, ${Math.ceil(m.seconds * spec.fps)} frames`);
  return (
    <div style={{display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: 8}}>
      {errors.length > 0 && (
        <div style={{color: "#ff7a7a", fontSize: 13}}>
          Not updated: {errors[0]}
          {errors.length > 1 ? ` (+${errors.length - 1} more, see the editor tab)` : ""}
        </div>
      )}
      <div style={{height: "92vh", aspectRatio: `${m.w} / ${m.h}`}}>
        <Player
          key={`${shown.src}-${m.w}x${m.h}-${spec.fps}`}
          component={ComicEdit}
          inputProps={{...spec, videoSrc: shown.src}}
          durationInFrames={Math.ceil(m.seconds * spec.fps)}
          fps={spec.fps}
          compositionWidth={m.w}
          compositionHeight={m.h}
          controls
          style={{width: "100%", height: "100%"}}
          errorFallback={({error}) => {
            console.error("[Preview] Player error:", error);
            return <span style={{color: "#ff7a7a"}}>Player error: {error.message}</span>;
          }}
          onError={(e) => console.error("[Preview] Player onError:", e)}
        />
      </div>
    </div>
  );
};

const rootEl = document.getElementById("root");
console.log(`[Preview] 2. mounting (root element ${rootEl ? "found" : "MISSING: preview.html has no <div id=root>"})`);
createRoot(rootEl!).render(
  <Boundary>
    <Preview />
  </Boundary>
);