/**
 * Regenerate promo-vo.mp3 — user's script synced to video scenes
 * Scene map (voiceover starts at video second 3):
 *   alone    (video 3-11s  = voice 0-8s)
 *   ghost    (video 11-25s = voice 8-22s)
 *   features (video 25-36s = voice 22-33s)
 *   tagline  (video 36-46s = voice 33-43s)
 *   outro    (video 46-57s = voice 43-54s)
 */
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const API_KEY = process.argv[2];
if (!API_KEY) { console.error("Usage: node generate-vo.mjs API_KEY"); process.exit(1); }
const __dir = dirname(fileURLToPath(import.meta.url));

const SSML = `<speak>

  <!-- ALONE scene: voice 0-8s -->
  <prosody rate="0.90" pitch="-2st">Most people work out alone.</prosody>
  <break time="700ms"/>
  <prosody rate="1.0" pitch="1st" volume="+2dB">Until now.</prosody>
  <break time="4000ms"/>

  <!-- GHOST scene: voice 8-22s -->
  <prosody rate="0.97">Felcin changes that.</prosody>
  <break time="600ms"/>
  <prosody rate="0.98">Train alongside real people.
    <break time="300ms"/>
    Their sessions, your gains.
  </prosody>
  <break time="500ms"/>
  <prosody rate="1.05" volume="+1dB">
    Live. <break time="200ms"/>
    On-demand. <break time="200ms"/>
    Any time.
  </prosody>
  <break time="3200ms"/>

  <!-- FEATURES scene: voice 22-33s -->
  <prosody rate="1.08">
    Go live. <break time="150ms"/>
    Track your progress. <break time="150ms"/>
    Take on challenges. <break time="150ms"/>
    Book real trainers.
  </prosody>
  <break time="4500ms"/>

  <!-- TAGLINE scene: voice 33-43s -->
  <prosody rate="0.93" pitch="-1st" volume="+1dB">
    The fitness platform built for people who actually show up.
  </prosody>
  <break time="4500ms"/>

  <!-- OUTRO scene: voice 43-54s -->
  <prosody rate="0.82" pitch="-3st" volume="+2dB">Felcin.</prosody>
  <break time="400ms"/>
  <prosody rate="0.88" pitch="-1st">Train together.</prosody>
  <break time="700ms"/>
  <prosody rate="0.96" pitch="0st">Now available on the App Store and Google Play.</prosody>

</speak>`;

const body = JSON.stringify({
  input: { ssml: SSML },
  voice: { languageCode: "en-US", name: "en-US-Chirp3-HD-Charon" },
  audioConfig: {
    audioEncoding: "MP3",
    speakingRate: 1.0,
    pitch: 0,
    volumeGainDb: 1.5,
    effectsProfileId: ["headphone-class-device"],
  },
});

const res = await fetch(
  `https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=${API_KEY}`,
  { method: "POST", headers: { "Content-Type": "application/json" }, body }
);

if (!res.ok) { console.error("API error:", await res.text()); process.exit(1); }

const { audioContent } = await res.json();
const buf = Buffer.from(audioContent, "base64");
const outPath = join(__dir, "public", "static", "promo-vo.mp3");
writeFileSync(outPath, buf);
console.log(`✓ Saved ${buf.length} bytes → ${outPath}`);
