import {Composition, staticFile} from "remotion";
import {getVideoMetadata} from "@remotion/media-utils";
import {DanceEdit2, VIDEO2} from "./DanceEdit2";

const FPS = 30;

// Size and length come from the video in /public
const videoMeta = (file: string) => async () => {
  const m = await getVideoMetadata(staticFile(file));
  console.log(`[Root] ${file}: ${m.width}x${m.height}, ${m.durationInSeconds.toFixed(3)}s`);
  return {durationInFrames: Math.ceil(m.durationInSeconds * FPS), width: m.width, height: m.height};
};

export const Root = () => {
  console.log("[Root] registering composition: DanceEdit2");
  return <Composition id="DanceEdit2" component={DanceEdit2} durationInFrames={90} fps={FPS} width={1080} height={1920} calculateMetadata={videoMeta(VIDEO2)} />;
};