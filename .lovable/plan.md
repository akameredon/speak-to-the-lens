# Teleprompter — build proposal

## Answers to the open questions
- **Who needs it most:** solo creators filming short spoken videos on their phone (tips, product talks, social clips).
- **Video length:** brief performances, about 30 seconds to 2 minutes.
- **What feels natural:** big words right under the lens, your face left clear, and controls you reach with a thumb.
- **What leads:** voice-following leads; timed scrolling is the backup and can be switched on any time.
- **Repeated phrases:** the reader only moves forward, matching spoken words within a short window ahead of the current word, so it never jumps back.
- **When recognition fails:** it switches to timed scrolling on its own, shows a clear "Auto scroll" badge, and keeps speed and position under your thumb.

## How it will be built (please confirm or change)
- **App:** a phone-first web app on this project's React stack — opens instantly in the phone browser, no install.
- **Storage:** everything stays on the phone. Profile and scripts in local storage; recordings in the browser's built-in file store (IndexedDB). The spec says no accounts or cloud library.
- **Sign-in:** none. The spec rules out accounts, so you open straight onto the filming screen.
- **AI writing:** Lovable Cloud's built-in AI (no keys to manage) powers "AI Script Writer" and "Polish Script", streaming text into the editor. This is the only part that uses Cloud.
- **Deploy:** Lovable publishing to a lovable.app address (custom domain optional later).

## Data (kept on the device)
- Creator Profile: name, preferred camera, font size, scroll speed, mirror, current script. Sample: Maya Chen, front camera, 34px, medium speed, mirror off.
- Script: title, body, last saved, is current. Sample: "Sunday Market Refill" (pantry script).
- Recording: title, created time, duration, video file, format, saved, thumbnail.
- Reading Session (in memory): current word, voice/auto mode, timer, recording state.
- Writing Request: topic, tone, length (30s / 60s / 2 min), status, generated text.

## Screens (all from the prototype)
Filming Surface (Film), Script Editor (Script), AI Script Writer (Write), My Recordings (Takes), Recording Review, Audio Help, Permission and Support messages. Brand: red #E63946, yellow #FFD60A highlight, near-black #0B0B10, off-white #F5F5F7, rounded system font, heavy script text.

## Build order (no further check-ins after approval)
1. Script panel above the lens over live camera
2. Thumb controls: size, speed, mirror, camera flip, editor
3. Local autosaved scripts
4. Forward-only voice following with yellow word highlight
5. Auto-scroll fallback with clear mode badge
6. Inline AI writer and polish
7. Recording with timer and clean stop
8. Review: play, download, share
9. Saved takes: play, download, delete
10. Audio help and permission/support messages

## Technical details
TanStack Start + Tailwind tokens; MediaRecorder (best supported mime: mp4 then webm); Web Speech API for recognition; IndexedDB via `idb-keyval`; Web Share API with file; AI via a server function calling the Lovable AI Gateway with streaming.
