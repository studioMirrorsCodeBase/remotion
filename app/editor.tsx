// app/editor.tsx
// NOT NEW: existing file, changed (the JSON file picker is now a text box to paste into; more logging)

// Tab 1: paste the JSON into the text box + pick the video. Valid JSON is saved and sent to tab 2.
import {useEffect, useRef, useState} from "react";
import {createRoot} from "react-dom/client";
import {validateSpec} from "../src/spec";
import {CHANNEL, DEFAULT_TEXT, saveVideo, STORE_KEY} from "./shared";

console.log("[Editor] 1. file loaded");

const showCrash = (msg: string) => {
  console.error("[Editor] CRASH:", msg);
  const root = document.getElementById("root");
  if (root && !root.innerHTML) root.innerHTML = `<pre style="color:#ff7a7a;padding:24px;white-space:pre-wrap">${msg}</pre>`;
};
window.addEventListener("error", (e) => showCrash(e.message));
window.addEventListener("unhandledrejection", (e) => showCrash(String(e.reason)));

const check = (text: string): {errors: string[]; warnings: string[]} => {
  try {
      if (!text.trim()) return {errors: ["No JSON yet. Paste it in the box above."], warnings: []};
    return validateSpec(JSON.parse(text));
  } catch (e) {
    return {errors: [`JSON syntax: ${(e as Error).message}`], warnings: []};
  }
};

const Editor = () => {
  console.log("[Editor] 2. component rendering");
  const [text, setText] = useState(() => {
    try {
      const saved = localStorage.getItem(STORE_KEY);
      console.log(`[Editor] start text from ${saved ? "localStorage (last good JSON)" : "DEFAULT_TEXT (scripts/natasja.json)"}`);
      return saved ?? DEFAULT_TEXT;
    } catch (e) {
      console.error("[Editor] localStorage failed", e);
      return DEFAULT_TEXT;
    }
  });
  const [videoName, setVideoName] = useState("none (tab 2 uses public/<video.file>)");
  const [videoErr, setVideoErr] = useState("");
  const ch = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    console.log(`[Editor] 3. opening channel "${CHANNEL}"`);
    ch.current = new BroadcastChannel(CHANNEL);
    return () => ch.current?.close();
  }, []);

  const {errors, warnings} = check(text);

  // every change of the text: check it; if valid, save it and send it to tab 2
  useEffect(() => {
    console.log(`[Editor] 4. text changed: ${text.length} chars, ${errors.length} error(s), ${warnings.length} warning(s)`);
    errors.forEach((e) => console.log("[Editor]   error:", e));
    warnings.forEach((w) => console.warn("[Editor]   warning:", w));
    if (errors.length) {
      console.log("[Editor]   not sent: tab 2 keeps the last good version");
      return;
    }
    try {
      localStorage.setItem(STORE_KEY, text);
      console.log("[Editor]   saved as last good JSON");
    } catch (e) {
      console.error("[Editor]   cannot save the JSON in localStorage", e);
    }
    ch.current?.postMessage({type: "json", text});
    console.log("[Editor]   sent {type: json}");
  }, [text]);

  const pickVideo = async (f: File | undefined) => {
    if (!f) return;
    console.log(`[Editor] video picked: ${f.name}, ${(f.size / 1e6).toFixed(1)} MB`);
    setVideoErr("");
    try {
      await saveVideo(f);
      setVideoName(f.name);
      ch.current?.postMessage({type: "video"});
      console.log("[Editor]   sent {type: video}");
    } catch (e) {
      console.error("[Editor] saving the video failed", e);
      setVideoErr(`Could not store the video in the browser (${(e as Error)?.message ?? e}). Try a smaller file.`);
    }
  };

  const row = {display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap"} as const;
  return (
    <div style={{padding: 24, display: "flex", flexDirection: "column", gap: 12, height: "100vh", boxSizing: "border-box"}}>
      <h2 style={{margin: 0}}>Comic editor</h2>
      <div style={row}>
        <label>
          1. Video: <input type="file" accept="video/*" onChange={(e) => pickVideo(e.target.files?.[0])} />
        </label>
        <span style={{opacity: 0.7}}>{videoName}</span>
        <a href="/preview.html" target="_blank" style={{color: "#D350EB"}}>
          3. Open the preview tab
        </a>
      </div>
      {videoErr && <div style={{color: "#ff7a7a", fontSize: 14}}>{videoErr}</div>}
      <div>2. Paste the JSON here (the preview updates as soon as it is valid):</div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        placeholder="Paste the JSON text here"
        style={{flex: 1, minHeight: 200, background: "#1e1830", color: "#eee", fontFamily: "monospace", fontSize: 13, border: "1px solid #444", padding: 8}}
      />
      <div style={{fontSize: 14, maxHeight: 140, overflow: "auto"}}>
        {errors.map((e, i) => (
          <div key={`e${i}`} style={{color: "#ff7a7a"}}>{e}</div>
        ))}
        {warnings.map((w, i) => (
          <div key={`w${i}`} style={{color: "#ffd166"}}>Warning: {w}</div>
        ))}
        {errors.length === 0 && <div style={{color: "#7aff9a"}}>JSON is valid and sent to the preview.</div>}
      </div>
    </div>
  );
};

const rootEl = document.getElementById("root");
console.log(`[Editor] 0. mounting (root element ${rootEl ? "found" : "MISSING"})`);
createRoot(rootEl!).render(<Editor />);