# ALTER

**A recursive mirror. Interactive art for a large LED wall.**
Live → **https://tejj003.github.io/trip-recursive-mirror/**

---

## Statement

*alter* — Latin, *the other of two*. The one in the mirror.

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

One thing does stay sharp. A separate pass finds your outline at full resolution and holds
it in front of the wreckage, dimming everything behind it so the shape survives. You are
given a clean edge and nothing else — no face, no detail, no colour of your own. The most
recognisable thing on a wall of pure colour is a silhouette, and the silhouette is the one
part the machine refuses to elaborate.

Stand still and it eats itself: with nothing new arriving, the loop grinds its own detail
down and fades to black. An empty room gets an empty wall — the mirrors stop turning and
wait. It is entirely dependent on you for material. Move, and it will take whatever you
give it and refuse, for a long time, to give it back.

You arrive as an outline and leave as weather.

*Tejj, 2026*

---

## How it works

Everything runs in the browser, in real time, on the GPU.

1. **Seeing** — each camera frame is reduced to luminance. A difference against the
   previous frame gives motion, with the frame-wide luminance shift subtracted so webcam
   auto-exposure does not register as the whole image moving.
2. **The figure** — a separate full-resolution pass runs a Sobel operator on the live frame
   and thresholds it into a clean line, gated by the motion mask so only a moving person
   draws. This is composited over everything else and knocks the field back behind itself.
   Computed at the low resolution used for the feedback, an outline dissolves into a blob
   on a wall-sized screen.
3. **Folding** — the screen is read in polar coordinates. Angles are wrapped into a wedge
   of `2π/N` and mirrored, which produces N-fold kaleidoscopic symmetry. The *source* is
   folded as well as the feedback, so the subject is multiplied around the mandala no
   matter where they stand.
4. **Turning** — the fold is then rotated, scaled outward and displaced by a curl-noise
   field. Zoom is always expansive, so energy drains off the edges instead of collapsing
   into a singularity at the centre.
5. **Colouring** — the previous frame is hue-rotated a little further each step (a
   Rodrigues rotation about the grey axis, which shifts hue without touching luminance),
   so anything that survives in the loop cycles endlessly through the spectrum. Each
   channel is sampled at a slightly different radius; compounded over hundreds of
   generations this becomes deep prismatic fringing.
6. **Staying sharp** — bilinear resampling every step compounds into blur, so the loop
   carries an unsharp term and a black floor, and iterates at a fixed 60 Hz regardless of
   display refresh rate. Without these the image degrades into a low-frequency wash within
   seconds.
7. **Waiting** — with nobody in front of it the transform collapses to the identity: no
   rotation, no zoom, no warp, no ink. The screen holds still and clears to black. A
   presence gate opens fast when someone arrives and releases slowly when they leave, so
   the piece is calm in an empty room and only moves for people.
8. **Finishing** — bloom, then saturation, gamma contrast, radial chromatic aberration and
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

The figure has three controls of its own:

- **Body** — outline brightness. Drop it to `0` for the pure abstract piece.
- **Outline gain** — how much edge detail is picked up. Raise it in low light.
- **Outline cutoff** — the noise gate. Raise it if the background starts drawing itself,
  lower it if the outline breaks up.

Three more govern how the piece wakes up:

- **Stillness** — how much the tunnel keeps turning with nobody there. `0` is a completely
  frozen screen; the default is a barely perceptible drift.
- **Presence** — how little movement counts as a person. Raise it if the wall stays asleep
  when someone walks past, lower it if passing traffic or a flickering light sets it off.
- **Hold** — seconds the piece stays awake after the last movement.

## Notes for unattended running

- Camera permission is granted once per device and persists on HTTPS.
- The Screen Wake Lock API keeps the display awake.
- If the camera drops the piece reconnects automatically and falls back to generative
  motion in the meantime.

---

## Requirements

A browser with WebGL 2 and float render-target support. Chrome is recommended for kiosk use.
