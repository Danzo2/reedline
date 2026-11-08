# Reedline

Turn photos and video clips into reeded glass artwork in your browser. A WebGL
shader recreates how ribbed glass bends, splits and frosts light, and you can
export the result as a high-resolution PNG or a looping MP4.

## Features

- Seven glass profiles, including Fluted, Prism, Bubbles and an animated Ripple
- Live controls for refraction, colour dispersion, frost, reflections, imperfections and grain
- MP4 input: clips are decoded frame by frame and the loop matches the clip length
- The canvas fits your photo's aspect ratio automatically
- PNG export up to 4K and looping MP4 export

## Getting started

```bash
npm install
npm run dev
```

Then open http://localhost:3002 in a desktop browser window at least 1024px wide
and upload a photo or MP4 clip. MP4 input needs a browser with WebCodecs
(Chrome, Edge or Safari).

## Built with

Toolcraft, WebGL, WebCodecs and mp4box.js.

## License

MIT. See [LICENSE](LICENSE). The bundled Toolcraft runtime is MIT licensed by
Pixel Point ([LICENSE.md](LICENSE.md)), and video export uses Mediabunny under
MPL-2.0 ([NOTICE.md](NOTICE.md)).
