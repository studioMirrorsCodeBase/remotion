// app/preview.tsx
// NEW FILE (to be created)

// Tab 2: plays the video with the captions on top (the same ComicEdit that Remotion renders), updates live when the editor tab sends new JSON or a new video.
import {useEffect, useMemo, useState} from "react";
import {createRoot} from "react-dom/client";
import {Player} from "@remotion/player";
import {getVideoMetadata} from "@remotion/media-utils";
import {staticFile} from "remotion";
import {ComicEdit} from "../src/ComicEdit";
import {validateAgainstVideo, validateSpec, type Spec} from "../src/spec";
import {CHANNEL, DEFAULT_TEXT, loadVideo, STORE_KEY} from "./shared";

type Meta = {w: number; h: number; seconds: number};
type Uploaded = {url: string; name: string};

const parse = (text: string): {spec?: Spec; errors: string[]} => {
  try {
    const raw = JSON.parse(text);
    const {errors} = validateSpec(raw);
    return errors.length ? {errors} : {spec: raw as Spec, errors};
  } catch (e) {
    return {errors: [`JSON syntax: ${(e as Error).message}`]};
  }
};

const Preview = () => {
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(STORE_KEY) ?? DEFAULT_TEXT;
    } catch {
      return DEFAULT_TEXT;
    }
  });
  const [uploaded, setUploaded] = useState<Uploaded | null>(null); // the video picked in the editor tab
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaErr, setMetaErr] = useState("");
  const [shown, setShown] = useState<{spec: Spec; meta: Meta; src: string} | null>(null); // last good version stays on screen

  const readUploaded = () =>
    loadVideo()
      .then((f) => {
        console.log(`[Preview] uploaded video: ${f ? f.name : "none"}`);
        setUploaded(f ? {url: URL.createObjectURL(f), name: f.name} : null);
      })
      .catch((e) => console.error("[Preview] cannot read the stored video", e));

  useEffect(() => {
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
  const src = uploaded ? uploaded.url : file ? staticFile(file) : "";

  useEffect(() => {
    if (!src) return;
    setMeta(null);
    setMetaErr("");
    getVideoMetadata(src)
      .then((m) => {
        console.log(`[Preview] video ${uploaded ? uploaded.name : file}: ${m.width}x${m.height}, ${m.durationInSeconds.toFixed(3)}s`);
        setMeta({w: m.width, h: m.height, seconds: m.durationInSeconds});
      })
      .catch((e) => setMetaErr(uploaded ? `Cannot read the chosen video (${e?.message ?? e})` : `No video chosen, and "${file}" is not in the public folder (${e?.message ?? e})`));
  }, [src]);

  const videoErrors = parsed.spec && meta ? validateAgainstVideo(parsed.spec, meta.seconds) : [];
  const errors = [...parsed.errors, ...videoErrors, ...(metaErr ? [metaErr] : [])];
  useEffect(() => {
    if (parsed.spec && meta && errors.length === 0) {
      console.log("[Preview] showing new version");
      setShown({spec: parsed.spec, meta, src});
    }
  }, [parsed.spec, meta, errors.length]);

  if (!shown) {
    return <div style={{padding: 24}}>{errors.length ? errors.map((e, i) => <p key={i} style={{color: "#ff7a7a"}}>{e}</p>) : "Loading the video..."}</div>;
  }
  const {spec, meta: m} = shown;
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
        />
      </div>
    </div>
  );
};

createRoot(document.getElementById("root")!).render(<Preview />);