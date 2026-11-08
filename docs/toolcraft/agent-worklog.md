# Implementation Worklog

## Status

Mode: product

Active change: readme-license-1

## Decisions

### Renderer
- Decision: One stateless WebGL fragment pass (`glass-preview`) refracts the uploaded photo through vertical reeds with per-channel dispersion, profile-shaped seam refraction, blocky imperfections, specular streaks and film grain. Export renders the same shader (`glass-export`) into an OffscreenCanvas WebGL working surface and composites it into the runtime Canvas2D frame. A retained source-scoped `source-decode` pass decodes the uploaded image once per `resourceRef` and is shared by preview and export.
- Reason: Per-pixel refraction with RGB dispersion at retina resolution and 30 FPS 4K video export needs the GPU; the pass has no compute, storage or feedback pressure, so WebGL (native, `browser-compatibility` exception) runs in every browser without WebGPU.
- Evidence: src/app/glass/glass-shader.ts, glass-gl.ts, glass-pipeline.ts, reeded-glass-canvas.tsx, glass-export.ts, src/app/app-performance.ts.
- Update (mp4-source-1): the source may also be an MP4 clip. `source-decode` then demuxes it (mp4box 2.4.1) and opens a WebCodecs `VideoDecoder` session; preview and export each get their own session (export keyed `resourceRef#export`) and upload the decoded `VideoFrame` for the current clip time as the glass texture. No DOM media element is used: the product source boundary rejects `<video>` hosts, `createElement`, DOM listeners and mediabunny imports.

### View Interaction
- Decision: non-spatial.
- Reason: A flat 2D image filter with no 3D scene or model.
- Evidence: appProductReadiness.viewInteraction.

### Interaction Ownership
- Decision: `glass-properties-panel` — all glass, pattern, motion and noise properties are global panel property edits; no canvas handles.
- Reason: The inspected reference exposes every glass parameter as panel sliders; a canvas angle handle would cover the output being judged.
- Evidence: appProductReadiness.interactionOwnership, linked to the `pattern.angle` acceptance row.

### Timeline
- Decision: Playback timeline, 5 s default, playing by default. The glass slides `Shift speed` (integer) reeds per loop using the runtime loop progress, so frame 0 and the loop end are identical (seamless, forward-only). Grain reseeds per 30 FPS frame. During viewport pan/zoom the preview holds its last time (play state unchanged).
- Reason: The user asked for an animated loop by default; the reference shows `shift speed 1.0` and `shift loop (sec) 5.0` on a 5.0 s timeline. Video export requires the timeline.
- Evidence: appTransferMode.animationIntent, timelineModule({ defaultDurationSeconds: 5, mode: "playback" }), glass-values.ts getGlassLoopShift.

### Layers
- Decision: Layers disabled.
- Reason: No layer workflow was requested; the reference's Noise layer is represented as the built-in Noise section of the single glass effect.
- Evidence: appSchema modules omit layersModule().

### Controls
- Decision: Sections Source (fileDrop), Glass (Amount, Dispersion, Frost, Reflection, Reflection scale), Pattern (Profile select with Rounded/Fluted/Prism/Wave, Repeats, Angle, Contrast, Imperfections, Imperfection scale), Motion (Shift speed), Noise (Amount, Grain size), Background (runtime Setup). Every reference control (amount, dispersion, reflection, reflection scale, pattern type, pattern repeats, pattern angle, pattern contrast, shift speed, shift loop → timeline duration, imperfections, imperfections scale) is mapped; Frost and Noise grain size were added.
- Reason: Built-in sliders/select/fileDrop fit every value model; the reference "pattern type" integer slider became a named Profile select so multiple pattern types are discoverable. Reference "shift loop (sec)" is the runtime timeline duration (one owner for loop length).
- Evidence: src/app/glass/glass-controls.ts, appControlSectionInventory.
- Update (mp4-source-1): Source holds two uploaders: `Photo` (image fileDrop) and `Video` (file fileDrop, `video/mp4`). An attached clip is the glass source in place of the photo. A single uploader for both is not possible without losing the photo thumbnail and 90°/Flip actions (the runtime image uploader accepts images only); the user chose a separate Video uploader.

### Export
- Decision: image (PNG/JPG, 2K/4K/8K) and video (MP4/WebM, Current/4K) both user-requested; SVG not requested.
- Reason: Primary request evidence — "have the ability to export in video and image (png & jpeg) formats".
- Evidence: appProductReadiness.exportIntent with transcript messageRef; imageExportModule(), videoExportModule(); scene.rasterFrameRenderer = reededGlassExportRenderer.

### Performance
- Decision: Workload dimensions preview-pixels (runtime backing, enforced 8192 px/edge), source-pixels (external upload, decoded long edge capped at 8192) and export-long-edge (image resolution 2K/4K/8K). Passes: source-decode (once, retained per source), glass-preview (frame, uncached, GPU), glass-export (batch, GPU). Viewport drag runs no pass; viewport zoom re-renders the preview at the new retina backing; slider edits/timeline only re-run glass-preview. No measured performance was run (first delivery is functional only).
- Reason: Real cost scales with backing pixels per frame; decode is a one-time source cost; export scales with the selected long edge squared.
- Evidence: src/app/glass/glass-workload.ts, glass-limits.ts, glass-pipeline.ts, src/app/app-performance.ts.

## Decision Trail

### Delivery 1 - Reeded glass image and video effect
- Change ID: delivery-1
- Request: Using toolcraft, Build an app that applies a reeded glass effect to an uploaded image and start a local preview. The app should by default show an animated loop motion for the reeded glass and have the ability to export in video and image (png & jpeg) formats. The app should also have the ability to add noise. See the attached example, we need our app to achieve this same effect and feel. We should also have the attached controls implemented as well along with any others you think is good to include. I've attached two example images as reference. Part of the validation criteria for your build should be ensuring the output from our app has the same look as the attached examples and equivalent for the video output. Note how the app should support multiple pattern types.
- Task type: First product delivery (Tier 4) — schema, custom WebGL renderer, timeline loop, image/video export, acceptance.
- User-visible result: Upload a photo; it plays as a seamless 5 s reeded glass loop with selectable Rounded/Fluted/Prism/Wave profiles, glass/pattern/motion/noise controls, and PNG/JPG/MP4/WebM export.
- Source/reference checked: Two the reference tool screenshots of the reeded glass panel (control names and values) and two processed output stills (476×643). Calibration used the screenshot's layer thumbnail as the source photo (the original was not supplied).
- Reference inputs: Static screenshots and stills only (no video/GIF), so no motion reference study; `referenceInputs: []`.
- Docs/contracts read: workflow.md, core/runtime-boundary.md, assembly-workflow.md, core/control-selection.md, core/layout.md, core/performance.md, core/timeline-animation.md, core/setup-export.md, core/media-upload.md, core/slider-ranges.md, core/app-cover.md, core/development-files.md, decision-contract.md, schema-reference.md, component-rules.md, renderer-technique.md, performance.md, acceptance-testing.md.
- Contract rules applied: runtime-shell-required, canvas-no-app-ui, canvas-surface-preserved, infinity-canvas-scene-bounds, interaction-surface-ownership, timeline-mode-choice, output-export-required, controls-section-inventory-required, renderer-technique-inventory, renderer-gpu-provider, renderer-view-interaction, acceptance-product-observable, performance-coverage-levels, persistence-policy-explicit.
- View interaction intent: non-spatial (2D image filter).
- Interaction ownership: Panel owns all glass properties (`glass-properties-panel`); runtime owns upload (fileDrop), timeline transport, viewport, background and export.
- Decision: WebGL fragment shader; product scene = editable artboard with the photo cover-cropped (upload never changes canvas size); reference-calibrated defaults Amount 1, Dispersion 0.3, Reflection 0, Reflection scale 1, Rounded profile, Repeats 7 (reed width = long edge / repeats), Angle 0, Contrast 4 (profile sharpness: clear reed centres, refraction concentrated at the seams), Shift speed 1 reed per 5 s loop, Imperfections 0.3, Imperfection scale 10, Frost 0, Noise 0.
- Alternatives rejected: VGPU/WebGPU (unavailable in some browsers, no compute pressure); Canvas 2D (too slow per pixel); a hidden noise layer (Layers not requested); a separate shift-loop slider (would duplicate the timeline duration); fitting the photo's own frame as the scene (letterboxes non-matching aspect ratios).
- State/output mapping: `source.image` → source-decode bitmap; glass.*/pattern.*/motion.*/noise.* values → shader uniforms; timeline loop progress × Shift speed → reed shift; canvas.size → scene rect; canvas.renderScale × zoom × DPR → preview backing; export.image.* / export.video.* → runtime artifact settings consumed by reededGlassExportRenderer; export.includeBackground / appearance.background → runtime fill only.
- Performance intent: ordinary-product-work
- Verification: Unit tests (src/app/glass/glass.test.ts) and the protected `npm run verify:delivery` gate; visual comparison of preview stills against the two reference images in the in-app browser.
- Risks: The original source photo was not supplied, so parity was judged against the reference stills using the low-resolution layer thumbnail; reference "pattern type" numbering is mapped to named profiles (1 → Rounded).

### Focused edit - Reference pattern parity
- Entry type: focused
- Change ID: pattern-parity-1
- Request: Compare a pattern type against the supplied room original/reference, then test the reference tool's reeded glass live (original image plus its Random image button) and iterate until our app matches.
- Changed owner: src/app/glass/glass-shader.ts, glass-values.ts, glass-controls.ts (Profile options), e2e/product-glass.spec.ts, e2e/product-export.spec.ts.
- User-visible result: Profile options now mirror the reference tool pattern types 0-3 (Blocks, Rounded, Bubbles, Hexagons) plus Fluted and Prism; Wave was replaced. Dispersion fringe width is capped so large lens offsets never turn regions into rainbows.
- Verification: Side-by-side renders of the room photo and the reference tool's random swimmer image at matching aspect against live the reference tool captures; glass unit tests 29/29; `npm run test:feature -- glass.pattern.type timeline.playback source.image` passed; export image/video/background/infinity specs passed via direct Playwright because the focused runner rejects the protected video-inspection helper (framework authority rule).
- Risks: the reference tool's exact shader is closed; parity is visual. The swimmer source was a 160 px in-page extraction.

### Focused edit - Ripple pattern
- Entry type: focused
- Change ID: ripple-pattern-1
- Request: thats good but we need another pattern type added, see this were its a bit more subtle  and smooth and shimmers back and forth almost like a ripple. See the video I just made
- Changed owner: src/app/glass/glass-shader.ts, glass-values.ts, glass-controls.ts (Profile option "Ripple"), e2e/product-glass.spec.ts.
- User-visible result: New Ripple profile, retuned from the user's screen recording (the reference tool pattern type 0 on the vase photo): fine horizontal row waves push details sideways into gentle wavy streaks, soft reed seams slide one reed per loop and briefly ghost edges, and the row waves sway back and forth, returning exactly at the loop end. Back-and-forth motion is explicitly requested for this profile; other profiles keep forward-only sliding.
- Reference inputs: None registered in the public repository. The user's motion reference for Ripple was studied locally with `npm run reference:study` and removed before publishing (publish-cleanup-1); Ripple stays covered by the plain browser assertions in `browser: pattern type select renders each reed profile`.
- Tooling: the study needed ffmpeg's drawtext filter; Homebrew cannot pour bottles on this macOS 27 Intel-prefix install, so ffmpeg 8.0.1 with freetype/harfbuzz/fontconfig was built from official sources into ~/.local/ffmpeg-drawtext and put first on PATH for `npm run reference:study`.
- Verification: Recording reviewed at real time and as 0.5 s / 0.2 s frame sheets plus the three study contact sheets, compared side by side with app renders at two loop times. Browser `browser: pattern type select renders each reed profile` checks Ripple: a tracked dark stripe shows wavy per-row displacement (spread 27 px, 10 direction changes, under 15% of a reed), the mid-loop profile sways (8.9 px mean difference) and the loop-end profile equals the start.
- Risks: Ripple amplitude and wavelength are calibrated by eye against low-resolution live captures.

### Focused edit - Vertical Ripple
- Entry type: focused
- Change ID: ripple-vertical-1
- Request: There shouldnt be any rows, everything should be vertical. Currently its rippling horizontally but not vertically. Check recording, motion also stop in the centre and is not as smooth as it should be but the main issue is the horizontal rows and poor rippling for the Rippling pattern type. fix this
- Changed owner: src/app/glass/glass-shader.ts (Ripple branch), src/app/app-acceptance-data.ts, e2e/product-glass.spec.ts, e2e/product-glass-support.ts.
- User-visible result: Ripple now uses fixed vertical reed strips; inside each strip ripples travel smoothly up or down (sideways wobble plus slight vertical breathing) with a per-strip phase, wavelength and resting offset, so the wobble never lines up into horizontal rows and edges break at the seams. Shading depends only on the position across a reed (no row bands), stepped imperfections are replaced by a smooth wobble for this profile, and every wave advances a whole number of cycles per unit of shift at constant speed (no sine swing that stalls), keeping the loop seamless. Supersedes the row-wave Ripple of ripple-pattern-1.
- Reference inputs: None registered in the public repository. The user's correction reference was studied locally with `npm run reference:study` and removed before publishing (publish-cleanup-1).
- Verification: Recording reviewed as a 1 FPS sheet, full-resolution crops and the study contact sheets; app renders of the user's source photo (Dandelion Seeds in Focus.png) with the user's settings (Ripple, Amount 2, Repeats 29, Imperfections 0.82, Imperfection scale 1) at two loop times compared with the the reference tool crop, plus a default-settings render. Browser `browser: pattern type select renders each reed profile` checks: zero red-channel change down flat columns (no rows), 12-level change across a row (vertical strips), a tracked stripe ripples within 15% of a reed, six equal 0.25 s steps each move it 0.5-2 px (never stalls) and the loop end equals the start. glass unit tests, app contract tests, ai:check and `npm run test:feature -- glass.pattern.type timeline.playback` pass.
- Risks: Ripple wavelength/amplitude are tuned by eye to the the reference tool crop; preview smoothness at very high zoom still depends on GPU fill rate.

### Focused edit - Saved default state and WebP uploads
- Entry type: focused
- Change ID: defaults-webp-1
- Request: Make these the default settings and this image load on first open of the app (screenshots: Amount 2, Dispersion 0.64, Frost 0, Reflection 0, Reflection scale 0.1, Profile Fluted, Repeats 29, Angle 0, Contrast 4, Imperfections 0, Imperfection scale 1, Shift speed 1, Noise 0, Grain 0.5px, PNG 4K, MP4 Current, dandelion photo); then "can you add compatibility for webp images for the site".
- Changed owner: src/app/app-defaults.json and public/toolcraft-defaults/images/ (written by the host-owned Save State as Default action, not by hand); src/app/glass/glass-source.ts (pairGlassSourceUrls), src/app/glass/reeded-glass-canvas.tsx (separate decode error, data-glass-source-name), src/app/app-acceptance-data.ts (source.image row), e2e/product-source.spec.ts, e2e/product-glass.spec.ts, e2e/product-glass-support.ts, src/app/glass/glass.test.ts.
- User-visible result: A fresh browser opens with "Dandelion Seeds in Focus.png" playing through Fluted glass with the requested values, panel scrolled to the top; Reset restores this state and photo. Uploading any image (WebP, PNG, JPEG) over the default photo now renders.
- Root cause (WebP report): not format-specific. Replacing an image keeps its media id, and for one render the runtime's id-keyed presentation URL is still the previous, revoked blob URL; the renderer paired the new resource with that stale URL, the decode fetch failed (ERR_FILE_NOT_FOUND) and the error stuck. The saved default photo made every first upload a replacement, so it surfaced with the user's WebP. Fix: a URL first observed for one resource is never paired with another; decode errors are cleared per source. WebP decodes natively (createImageBitmap); image export formats stay runtime-owned PNG/JPG.
- Verification: probe uploads of PNG and WebP over the default photo render with no error; unit test for stale-URL pairing; source.image browser test now uploads a WebP over the default and proves first-open photo, replacement and Reset restore via the rendered source name; Ripple parity measures near Amount 1 / Repeats 7 with row-aligned profiles. Focused browser rows (all glass sliders, pattern type, source, timeline, render scale, infinity, persistence) and the export spec (direct Playwright, 10/10) pass; app unit/contract tests and ai:check pass.
- Risks: browser tests now start from the saved default state; changing defaults again needs the same review of tests that assume starting values.

### Focused edit - Contrast 0 default and canvas auto-fit to source
- Entry type: focused
- Change ID: contrast-autofit-1
- Request: Save Contrast 0 as the default; then "edit the app so that the aspect ratio dynamically adjusts automatically to the input's aspect ratio so that it best fits the dimensions of the input. Currently, I have to do that manually".
- Changed owner: src/app/app-defaults.json (host Save State as Default, Contrast 0); new src/app/glass/glass-canvas-fit.ts (+ test) wired in src/app/glass/reeded-glass-canvas.tsx; e2e/product-glass.spec.ts (contrast slider drag direction and Ripple parity measuring at Contrast ~4); e2e/product-source.spec.ts.
- User-visible result: First open shows Contrast 0. Uploading a photo (or rotating it 90 degrees) resizes the artboard to the photo's proportions at the same long edge, so the whole image is shown without manual Aspect ratio edits.
- Decision: a freshly uploaded or rotated source image (lifecycle `ready` with a new resource/orientation) dispatches runtime `canvas.applySettings` with the image's aspect ratio and the current canvas long edge (even pixels; Aspect ratio shows Custom with the reduced W:H). Restored and default images arrive as `restoring` and never refit, so saved/reloaded sizes and Reset stay as the user left them; manual size edits after an upload are kept. History is skipped so undoing an upload refits to the previous image without clearing redo. Sizing mode stays `editable-output` (intrinsic-media would set full source pixels, e.g. 6000 px x render scale 2, as the WebGL backing). Supersedes the "uploads do not change canvas size" behavior of defaults-webp-1.
- Verification: unit tests for fit math/rotation; scripted browser check (9:16 upload -> 1080x1920, 2:1 -> 1920x960, 90 deg rotate -> 960x1920, reload keeps 960x1920); `npm run test:feature -- glass.pattern.contrast glass.pattern.type source.image` pass; glass unit tests and typecheck pass.
- Risks: the canvas view is not re-zoomed after a refit, so a tall result can overflow the viewport at 100% until the user zooms.

### Focused edit - MP4 video source
- Entry type: substantial
- Change ID: mp4-source-1
- Request: "build MP4 video input support". User choices (in-chat questions): loop length "Match the video (Recommended)"; upload placement "Separate Video uploader (Recommended)" after the single-uploader option was shown to drop photo previews and transforms.
- Task type: schema/controls, renderer/canvas output, timeline, media, export.
- Source/reference checked: runtime media import handlers (image uploader accepts images only), timeline setDuration reducer, product source boundary scripts, mp4box 2.4.1 type declarations.
- Reference inputs: none (no motion reference; the test clip is a generated fixture documented in e2e/fixtures/README.md).
- Docs/contracts read: workflow.md, core/timeline-animation.md, core/runtime-boundary.md, core/media-upload.md, core/performance.md, core/control-selection.md, core/layout.md, core/setup-export.md (export sections).
- Contract rules applied: fileDrop owns source uploads (no canvas upload UI); renderer reads timeline time through the loop helpers; export renders through the shared rasterFrameRenderer at runtime-scheduled times (no product encoder); duration is set only on a fresh upload event, never by watching duration; media-lifecycle acceptance proves upload, remove and reset.
- View interaction intent: unchanged, non-spatial.
- Interaction ownership: unchanged; the Video uploader is a panel fileDrop like Photo, with no canvas counterpart.
- User-visible result: Source has a `Video` uploader under `Photo`. Uploading an MP4 replaces the photo with the refracted clip, fits the artboard to the clip's displayed aspect ratio (phone rotation metadata honoured) and sets the timeline duration to the clip length, so Export MP4 covers the clip once, frame-accurately. Scrubbing and playback show the matching clip frame; removing the clip or resetting Source returns to the photo. A reloaded clip restores without refitting. Exports are silent (audio is not carried).
- Decision: runtime has no video asset kind, so the clip is an `assetKind: "file"` upload on target `source.video`; `getGlassActiveSource` prefers it over the photo. Clip time = timeline loop time wrapped into the clip (`getGlassVideoTime`). Frames decode on demand from the nearest keyframe; forward requests continue the session, so playback and sequential export decode each frame once. Auto-fit generalised to clips: a fresh `ready` clip waits for its decoded size, then fits the canvas (history skipped) and dispatches `timeline.setDuration` (recorded, user edits win afterwards); restored/default sources never fit.
- Alternatives rejected: hidden `<video>` elements (rejected by the product boundary as interactive raw hosts and DOM listeners); mediabunny demux (import reserved for runtime export); hand-written MP4 parser (mp4box handles fragmented files, edit lists and 64-bit offsets).
- State/output mapping: `source.video` media asset -> `source-decode` (clip session) -> `glass-preview` / `glass-export` texture; `timeline.durationSeconds` set once per fresh clip; pipeline `media-import` and `source-decode` inputs include `source.video`. New dependency `mp4box` 2.4.1 (BSD-3-Clause, pinned; 2.5.0 was under two weeks old).
- Also fixed: `pairGlassSourceUrls` now publishes URLs for file assets; export/canvas specs still expected the pre-auto-fit 16:9 artboard for the 4:3 fixture photo (contrast-autofit-1 regression in tests only) and now expect 4:3 sizes.
- Verification: unit tests (clip demux of e2e/fixtures/glass-clip.mp4, rotation matrix, reordered-sample lookup, clip time, source priority, fit keys); `npm run test:feature -- source.video source.image timeline.playback persistence.reload canvas.infinity-mode canvas.renderScale` pass; e2e/product-export.spec.ts 10/10 and product-glass + product-timeline specs 15/15 via direct Playwright (product-export.spec is rejected by the feature runner's Playwright-authority check, unchanged from before); scripted checks: clip MP4 export decoded by ffprobe as 1920x1440, 2.000 s, 60 frames, red at 0.4 s / blue at 1.4 s; a 90-degree rotation-metadata clip renders portrait 1080x1920 matching ffmpeg's orientation; reload keeps a hand-edited size. app unit/contract tests (748), ai:check, docs and integrity checks pass. No measured performance was run.
- Risks: headless software GL draws photo and clip playback at a similar ~7 frames/s, so real-GPU playback smoothness for long or 4K clips is not measured; HEVC clips decode only where the browser supports HEVC (a visible error otherwise); very long clips make video export proportionally slower; audio is dropped.

### Focused edit - Public repository cleanup
- Entry type: focused
- Change ID: publish-cleanup-1
- Request: "rename project to reedline and make public", then "Clean up, then publish (Recommended)" (in-chat question about the screen recordings, reference-tool mentions and local paths).
- Changed owner: src/app/app-acceptance-data.ts (referenceInputs now [], Ripple motionReferenceCoverage and the local transcript path removed), e2e/product-glass.spec.ts (Ripple checks are plain assertions), src/app/glass/glass-controls.ts (Profile description), removed src/app/glass/glass-motion-reference.ts and src/app/reference-studies/, app-cover.json, app-cover-state.json, public/toolcraft/cover.png, this worklog.
- User-visible result: No product behaviour change. The GitHub repository is Danzo2/reedline; the screen-recording contact sheets, the reference-tool name and local file paths are no longer in the repository, and the cover is now the app's own render of its bundled dandelion photo instead of a reference-tool image. Originals are kept locally in .toolcraft/scratch/publish-backup (ignored by git).
- Verification: app unit/contract tests, ai:check, docs/integrity checks and `npm run test:feature -- glass.pattern.type`; cover exported at 4K from a fresh session and inspected.
- Risks: the Ripple behaviour is no longer traced to a registered motion reference, only to its browser assertions.

### Focused edit - README, license and no bundled images
- Entry type: focused
- Change ID: readme-license-1
- Request: "the app needs to be mit license as standard for open source", draft a short README, then "Dont worry about including any images in the readme or repo and go ahead and publish the readme".
- Changed owner: README.md, LICENSE (MIT for the app code; Toolcraft's LICENSE.md is unchanged), src/app/app-defaults.json (no default source photo), removed public/toolcraft-defaults/images/60ffddc9270271edc0b218f94434bf753657a98f52a67148a5df8bef57e41701.bin, app-cover.json, app-cover-state.json and public/toolcraft/cover.png.
- User-visible result: A fresh session opens with an empty Source until the user uploads a photo or clip; all other saved defaults are unchanged. The repository has a README and an MIT LICENSE and ships no bundled photos. The removed files are kept locally in .toolcraft/scratch/publish-backup.
- Verification: app unit/contract tests, ai:check, files:check and docs:check.
- Risks: the app has no cover (core/app-cover.md) by the user's choice; catalog registration would need one.

## Evidence

- Source reviewed: the reference tool reference screenshots and processed stills; local Toolcraft contract docs.
- Contract applied: product decisions above.

## Verification

Protected receipts own initial/performance proof.

## Risks

- Risk: The four built-in profiles approximate the reference tool's pattern types; only type 1 (Rounded) was visible in the references.
- Risk: Very large sources are downscaled to an 8192 px long edge before refraction.
