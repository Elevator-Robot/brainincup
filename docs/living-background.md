# Living nebula atmosphere

`SiteBackground` uses `NebulaBackdrop` as an optional native-density WebGL layer.
It preserves the violet/cyan palette and shared SVG atmosphere, without adding
video, external textures, painted bands, orbital rings, diagrams, or literal faces.

## Visual character

The fragment shader combines independently moving domain-warped noise fields,
fine mist detail, dim occluding folds, sparse pixel-scale stars, and stable
dithering. Light pulses combine unequal periods rather than following a short
obvious loop. A very weak, imperfect bilateral correlation suggests fleeting
pareidolia; it never draws eyes or a face. Pointer response is delayed and subtle,
creating the impression of depth/presence rather than a spotlight glued to the
cursor. This is visual atmosphere, not a claim that the site is watching the user.

The center is quieter for reading; there are no flashes, jump scares, camera
shakes, or controls in the background. All modes share the same atmosphere.

## Resolution and lifecycle

- Render at device pixel density (up to DPR 3), with an 8,294,400-pixel budget:
  actual 3840×2160 on a UHD viewport or 1920×1080 at DPR 2. Preserve aspect ratio
  for larger/ultrawide windows and respect GPU dimension limits.
- No low-resolution intermediate buffer is scaled up. Procedural detail is
  evaluated at the final framebuffer resolution.
- Cap animated draws at 24 fps without reducing resolution. Suspend the frame
  loop in hidden tabs; resume the accumulated scene clock without a jump.
- Reduced motion renders a sharp still frame, with no continuous GPU loop.
- Keep the original vector visible until the first successful GPU frame. Fall
  back immediately on context loss, rebuild on restoration, and release shaders,
  buffers, observers, listeners, and animation frames on unmount.
- Pause the hidden SVG/dust animations while the GPU scene is active. No new
  network or inference requests, dependencies, or provider configuration are used.

Unsupported/failed WebGL retains the existing SVG/CSS atmosphere. Performance and
maximum resolution depend on the device; the budget intentionally targets UHD,
not unbounded 8K rendering. Fullscreen shaders add GPU work, so review on physical
mobile/low-power devices as well as desktop before release.

## Demo and checks

Run `npm run demo` and open `http://localhost:5173/?testmode=true`. Watch the mist
for a few seconds, move the cursor slowly, and compare reduced-motion mode.
Use `http://localhost:5173/?testmode=true&empty=true` to view the intentionally
silent empty workspace without clearing any real conversation.
Tests cover native resolution/budgets, cadence, hidden-tab suspension, phase-safe
resume, reduced-motion stills, allocation cleanup, and context recovery.
