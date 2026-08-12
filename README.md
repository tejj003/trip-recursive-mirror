# Trip

**A recursive mirror. Interactive art for a large LED wall.**
Live → **https://tejj003.github.io/trip-recursive-mirror/**

---

## Statement

A room with two mirrors facing each other has no bottom to it. You look in, and the
reflections go on until they run out of light. This piece is that room, except the mirrors
are turning, and the light is being repainted every sixtieth of a second.

Nothing here is drawn from scratch. Every frame is the previous frame — folded into a
wedge, spun a fraction of a degree, pushed outward, nudged sideways by a current that has
no source, its colour rotated one step further around the wheel, its red and blue pulled
gently apart until the whole image is fringed like the edge of a soap bubble. Then your
movement is stirred in, and it happens again.

So the mandala on the wall is not an image of you. It is an image of an image of an image
of you, several thousand generations deep, and by the time you recognise a gesture as
yours it has already become a petal, then a ring, then weather.

Stand still and it eats itself: with nothing new arriving, the loop grinds its own detail
down and fades to black. It is entirely dependent on you for material. Move, and it will
take whatever you give it and refuse, for a long time, to give it back.

*Tejj, 2026*

---

## How it works

Everything runs in the browser, in real time, on the GPU.

1. **Seeing** — each camera frame is reduced to luminance. A Sobel operator gives edges; a
   difference against the previous frame gives motion, thresholded so sensor noise
   contributes nothing.
2. **Folding** — the screen is read in polar coordinates. Angles are wrapped into a wedge
   of `2π/N` and mirrored, which produces N-fold kaleidoscopic symmetry. The *source* is
   folded as well as the feedback, so the subject is multiplied around the mandala no
   matter where they stand.
3. **Turning** — the fold is then rotated, scaled outward and displaced by a curl-noise
   field. Zoom is always expansive, so energy drains off the edges instead of collapsing
   into a singularity at the centre.
4. **Colouring** — the previous frame is hue-rotated a little further each step (a
   Rodrigues rotation about the grey axis, which shifts hue without touching luminance),
   so anything that survives in the loop cycles endlessly through the spectrum. Each
   channel is sampled at a slightly different radius; compounded over hundreds of
   generations this becomes deep prismatic fringing.
5. **Staying sharp** — bilinear resampling every step compounds into blur, so the loop
   carries an unsharp term and a black floor, and iterates at a fixed 60 Hz regardless of
   display refresh rate. Without these the image degrades into a low-frequency wash within
   seconds.
6. **Finishing** — bloom, then saturation, gamma contrast, radial chromatic aberration and
   luminance-weighted grain.

No build step, no dependencies to install, no server. Three.js is loaded from a CDN via an
import map; the whole piece is `index.html` and two JavaScript files.

---

## Modes

The piece cycles automatically every 40 seconds, or press **M**.

| Mode | Character |
| --- | --- |
| **Tunnel** | No fold. Liquid ink flowing outward — the most figurative mode |
| **Kaleido** | 8-fold mandala, slow rotation |
| **Spiral** | 6-fold, fast rotation, heavy prism — the most aggressive |
| **Melt** | No fold, almost no zoom, maximum warp. Slow and viscous |
| **Bloom** | 12-fold flower, counter-rotating, short memory |

## Keys

| Key | Action |
| --- | --- |
| **H** | Tuning panel — live sliders, saved to `localStorage` |
| **M** | Next mode |
| **P** | Next palette |
| **A** | Auto-cycle on/off |
| **T** | Show/hide the title |
| **C** | Camera preview — use this to aim the camera |
| **F** | Fullscreen (double-click also works) |
| **R** | Reconnect the camera |

## URL parameters

| Parameter | Default | Purpose |
| --- | --- | --- |
| `?dpr=` | `1.25` | Device-pixel-ratio cap. The feedback buffer is full-resolution, so this is the main performance lever |
| `?maxpixels=` | `3200000` | Total pixel budget; resolution scales down beyond it |
| `?nocam=1` | off | Run as pure generative art, no camera at all |

## Tuning on site

Press **H**. *Ink* is how strongly movement feeds the loop; *Edge ink* adds the subject's
outline; *Sharpen* fights the resampling blur — too much and the image crackles. If the
room is dark or the camera noisy and the field floods with colour, lower *Ink* first.

## Notes for unattended running

- Camera permission is granted once per device and persists on HTTPS.
- The Screen Wake Lock API keeps the display awake.
- If the camera drops the piece reconnects automatically and falls back to generative
  motion in the meantime.

---

## Requirements

A browser with WebGL 2 and float render-target support. Chrome is recommended for kiosk use.
