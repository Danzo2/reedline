# Product test fixtures

- `glass-clip.mp4` — 2 s, 480x360 (4:3), 30 FPS H.264 clip: solid red for the first second, solid blue for the second. Used by `e2e/product-source.spec.ts` to prove MP4 source upload, canvas/loop auto-fit and frame-accurate clip timing. Regenerate with:
  `ffmpeg -f lavfi -i "color=c=0xd02020:s=480x360:r=30:d=1" -f lavfi -i "color=c=0x2040e0:s=480x360:r=30:d=1" -filter_complex "[0:v][1:v]concat=n=2:v=1[v]" -map "[v]" -c:v libx264 -pix_fmt yuv420p -profile:v baseline -movflags +faststart glass-clip.mp4`
