## 27.11.2026 (71, P6 + P8a): where the frame's time goes -- the 16-bit intermediates paid for elsewhere; live depth measured

Packages P6 and P8a of `docs/PLAN_2026-11-27.md`, by agent "p6" (branch `wt-p6` from b9ea6a83).  Every number was
measured on the reference machine (RTX 5090, panel 2880 x 1620, 120 Hz, render scale 1), each app run through the
heavy-job lock, timing runs alone.

| package | what | result |
|---|---|---|
| P6 (a) | GPU time per station of the frame (`KALEIDO_GPU_PASSES`, `perf_labs.py --passes --gpumem`) at 8 bit, 16 bit and R11F_G11F_B10F | 16 bit costs +0.17 ms: the limiter's measure frame 0.078, the full-frame passes' bandwidth ~0.08, MSAA resolve +0.03 on 3D; but 0.29 ms of EVERY frame (8 or 16 bit) sat in two compute passes run by one work group / one invocation |
| P6 (b) | R11F_G11F_B10F for the targets (nobody reads their alpha) | as fast as 8 bit and -240 MB against 16 bit, but its highlights are coarser than 8 bit (65 / 33 levels in 0.5..1 against 128): not taken; `KALEIDO_HDR_FORMAT=r11` stays as a measuring switch |
| P6 (c) | the mipmaps | the present source's chain costs 0.05 ms at 8 and 16 bit alike and every level is read; the limiter's measure frame (16 bit only) is now drawn at a quarter of the size |
| P6 (d) | the exposure histogram and the limiter in parallel | histogram 0.20 -> 0.015..0.021 ms, limiter 0.086 -> 0.021 ms, the same numbers (exports framemd5-identical with the old measure); with (c) the 16-bit frame is cheaper than the 8-bit one was: ChainLab2D 1.00 -> 0.61 ms (8 bit was 0.83), TunnelPlain 0.71 -> 0.33 (0.54) |
| P8a | Depth Anything V2 Small on the GPU beside the app | 15 depth frames a second at 252..518 px with every runtime (fp32), the app's median 120 fps throughout, its minimum 100..120; model alone 3.3..14.6 ms, plus 6..15 ms of CPU resizing; +40 MB (DirectML, Windows only) or +44 MB (WebGPU, Windows and Linux) or +2.4 GB (CUDA) |

### P6 (a) -- where the time goes

*The instrument.*  `KALEIDO_GPU_TIMING` gives one number per frame (a GL_TIME_ELAPSED query around draw()); such a
query cannot nest, so a per-pass timer needs timestamps.  `KALEIDO_GPU_PASSES=1` (glcore.cpp, `glcorePassFrame()`):
between glwidget's draw() bracket every `glcoreDebugMark()` -- the station names the KHR_debug messages already
carried (`scene:act`, `oit`, `scene:next`, `transition`, `present`, `shadowPass1/2`) plus new ones (`sims`,
`scene:resolve+cap`, `fx`, `overlay`, `overlay:next`, `blend`, `trails`, `guard+spout`, and inside the present pass
`present:history`, `:mips`, `:measure`, `:readback`, `:limit`, `:expo`, `:bloom`, `:draw`) -- issues a
`glQueryCounter( GL_TIMESTAMP )`; a station's time runs to the next mark.  Five frames in flight, read four frames
later (nothing waits), one `[gpupass] n=.. total=.. <station>=<ms> ...` line a second, the mean per frame.  Two
optional entry points came into glcore (`glQueryCounter`, `glGetQueryObjectui64v`); without them, or without the
switch, nothing happens.  The sum of the stations agrees with `KALEIDO_GPU_TIMING`'s frame (0.826 against 0.86,
0.538 against 0.54 ms).  `Tools/perf_labs.py --passes` prints the median of each station under the scene (and as
`pass:<station>` columns with `--tsv`); `--gpumem` adds the process's dedicated GPU memory four seconds before the
end (the counter `Tools/soak.py` reads).

*The run* (`perf_labs.py --passes --gpumem --wav Tools/review128.wav`, 22 s a scene, the first 6 s left out, alone in
the lock; 8 bit = `KALEIDO_HDR_BUFFERS=0`, 16 bit = `=1`, R11 = `=1` plus `KALEIDO_HDR_FORMAT=r11`, see (b)).  Median
ms per frame; 120 fps everywhere:

| scene | targets | frame | scene | resolve | fx | overlay | blend | trails | mips | measure | limit | expo | bloom | draw | GPU MB |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ChainLab2D | 8 bit | 0.83 | 0.291 | 0.005 | 0.021 | 0.017 | 0.028 | 0.032 | 0.051 | 0.001 | 0.087 | 0.198 | 0.012 | 0.066 | 923 |
| ChainLab2D | 16 bit | 1.00 | 0.291 | 0.005 | 0.031 | 0.027 | 0.058 | 0.055 | 0.057 | 0.079 | 0.085 | 0.208 | 0.013 | 0.071 | 1143 |
| ChainLab2D | R11 | (0.65) | 0.294 | 0.005 | 0.021 | 0.017 | 0.029 | 0.034 | 0.051 | 0.077 | (new) | (new) | 0.012 | 0.068 | 973 |
| TunnelPlain | 8 bit | 0.54 | 0.015 | 0.002 | 0.018 | 0.016 | 0.027 | 0.025 | 0.051 | 0.001 | 0.086 | 0.197 | 0.012 | 0.065 | 768 |
| TunnelPlain | 16 bit | 0.71 | 0.025 | 0.002 | 0.029 | 0.028 | 0.056 | 0.048 | 0.057 | 0.079 | 0.087 | 0.203 | 0.012 | 0.067 | 1052 |
| TunnelPlain | R11 | (0.39) | 0.029 | 0.003 | 0.018 | 0.016 | 0.028 | 0.028 | 0.052 | 0.077 | (new) | (new) | 0.012 | 0.067 | 854 |
| ParticleTunnelFlight | 8 bit | 0.71 | 0.040 | 0.151 | 0.003 | 0.021 | 0.027 | 0.020 | 0.049 | 0.001 | 0.086 | 0.201 | 0.012 | 0.067 | 880 |
| ParticleTunnelFlight | 16 bit | (0.65) | 0.059 | 0.131 | 0.002 | 0.028 | 0.054 | 0.035 | 0.054 | 0.078 | (new) | (new) | 0.012 | 0.083 | 1209 |
| ParticleTunnelFlight | R11 | (0.57) | 0.057 | 0.144 | 0.002 | 0.018 | 0.028 | 0.024 | 0.052 | 0.076 | (new) | (new) | 0.011 | 0.076 | 967 |
| VolumetricFire | 8 bit | 1.80 | 1.277 | 0.045 | 0.003 | 0.016 | 0.017 | 0.018 | 0.048 | 0.001 | 0.082 | 0.199 | 0.011 | 0.061 | 879 |
| VolumetricFire | 16 bit | (2.07) | 1.571 | 0.058 | 0.003 | 0.026 | 0.031 | 0.026 | 0.050 | 0.080 | (new) | (new) | 0.013 | 0.066 | 1208 |
| VolumetricFire | R11 | (2.46) | 2.079 | 0.048 | 0.003 | 0.018 | 0.017 | 0.021 | 0.047 | 0.071 | (new) | (new) | 0.011 | 0.063 | 966 |
| Spaceship | 8 bit | 0.79 | 0.218 | 0.058 | 0.003 | 0.016 | 0.030 | 0.027 | 0.053 | 0.001 | 0.085 | 0.194 | 0.012 | 0.071 | 967 |
| Spaceship | 16 bit | (0.76) | 0.216 | 0.088 | 0.002 | 0.027 | 0.059 | 0.040 | 0.053 | 0.075 | (new) | (new) | 0.012 | 0.076 | 1296 |
| Spaceship | R11 | (0.61) | 0.216 | 0.064 | 0.002 | 0.017 | 0.030 | 0.026 | 0.049 | 0.078 | (new) | (new) | 0.011 | 0.074 | 1054 |
| MeshTuningForks | 8 bit | 0.80 | 0.193 | 0.059 | 0.003 | 0.016 | 0.030 | 0.027 | 0.052 | 0.001 | 0.085 | 0.193 | 0.011 | 0.072 | 928 |
| MeshTuningForks | 16 bit | (0.74) | 0.220 | 0.089 | 0.003 | 0.029 | 0.057 | 0.046 | 0.054 | 0.074 | (new) | (new) | 0.012 | 0.077 | 1257 |
| MeshTuningForks | R11 | (0.63) | 0.189 | 0.060 | 0.003 | 0.017 | 0.030 | 0.029 | 0.050 | 0.076 | (new) | (new) | 0.011 | 0.076 | 1015 |

"(new)": a trap of my own.  The app reads Engine/*.comp from the worktree at every start, and while the run went
through its scenes I wrote the parallel versions of (d) into Engine/ -- every app start after that (from the 16-bit
ParticleTunnelFlight on) took the new limiter and the new histogram's stage 0, without the C++ that dispatches its
stage 1 (so the exposure stood still in those runs; their `limit` 0.021..0.023 and `expo` 0.004 are the new shaders'
costs, their frame sums in brackets not comparable).  The other stations do not depend on it.  A rerun of the old
16-bit state at 13:13 was useless for another reason: the user had a game running on the GPU, and every station came
out 2..3 times slower.  Lesson: never edit a shader of the worktree a measuring run is reading.  The VolumetricFire
`scene` column (1.28 / 1.57 / 2.08) moves from run to run with the walk's rolls; the scene's own cost is not this
question.

What 16 bit costs, against 8 bit (the two 2D scenes; the 3D ones the same, plus the MSAA resolve):

- `present:measure` +0.078 ms -- the limiter's own frame (Engine/LightMeasure.frag, section (69) L1), drawn at the
  full render size and mipmapped, only with 16 bit.  The largest single item: 45 % of the difference.
- the full-frame passes, twice the bytes: `blend` +0.030 (the final mix reads two frames), `trails` +0.023,
  `overlay` +0.010, `fx` +0.010 (the rig copy), on 3D scenes `scene:resolve+cap` +0.03 (the 4x MSAA resolve).
  Together ~0.08 ms: bandwidth.
- `present:mips` +0.006: the mip chain of the present source is not format-bound.
- GPU memory +220 (ChainLab2D) .. +284 (TunnelPlain, with the rig's scratch targets) .. +329 MB (every 3D scene:
  the MSAA colour is 4 x 18.7 MB more): the five frame-sized targets (scene x2, FX x2, transition) 93 MB, the three
  mipmapped ones (final, trails x2) 75 MB, the measure frame 50 MB, the MSAA colour 75 MB, the rig targets 37 MB.

And what neither 8 nor 16 bit is about: `present:expo` 0.20 ms and `present:limit` 0.086 ms in EVERY frame --
together more than the whole 16-bit difference, more than the scene of TunnelPlain (0.015).  The auto-exposure's
histogram (Engine/CfxHistogram.comp) ran as ONE work group: 256 invocations walked 292,000 samples (1 in 16 pixels
at 2880 x 1620) with shared-memory atomics while the other 169 multiprocessors idled; the limiter
(Engine/SafetyLimit.comp) as ONE invocation followed 128 flashing-area cells with eight reversal ages each, every
access a round trip to the buffer.  That is (d).

### P6 (b) -- R11F_G11F_B10F: as cheap as 8 bit, but coarser than 8 bit where it is bright

*Who reads the alpha of the intermediates* (read in the code, every consumer of the targets `m_texInternalFormat`
makes): the transitions and the FX (combine) shaders read the scene frames on units 3/4 -- 30 FX files, none reads
`.a` (FxPulse and the transitions such as PrismDispersionDrift, AfterimageHandoffHalo, MistRiseVeil only pass it on
into their own output); OverlayBlend mixes two vec4s; Engine/Feedback.frag (the trails) reads `.rgb` and writes
alpha 1, so whatever alpha a scene wrote -- the 2D scenes with an alpha of their own among them -- ends there;
Present.frag, BloomBlur.frag and LightMeasure.frag read `.rgb`; the seven `texPrevFrame` scenes read `.rgb`; no blend
function in Source/ uses the destination alpha (`DST_ALPHA`: none), the OIT pass blends with the source's alpha and
keeps its own RGBA16F accumulation; `capSceneLight()`'s GL_MIN keeps the alpha it never needed.  The photo's alpha
(its depth since 26.11.) lives in the PHOTO textures (RGBA8 images, never a render target) and is not affected.  The
one place an intermediate's alpha leaves the program: Spout "clean" (`spoutSource=clean`) of a full-stereo frame
sends the eye-packed scene target as it is.  So the alpha is free.

*The cost* (`KALEIDO_HDR_FORMAT=r11`, a measuring switch: `RenderPipeline.cpp` `hdrFormat()`; the targets that follow
`m_texInternalFormat` become R11F_G11F_B10F, the MSAA colour too; the present pass treats it as 16 bit): the
full-frame passes are back at their 8-bit times (`blend` 0.029, `trails` 0.024..0.034, `overlay` 0.017), the GPU memory
is 50..90 MB above 8 bit and 170..250 MB below 16 bit (TunnelPlain 768 / 1052 / 854 MB, ParticleTunnelFlight 880 /
1209 / 967, Spaceship 967 / 1296 / 1054).  (The `limit` and `expo` columns of that run already show (d)'s shaders --
see "the run" below.)

*The ramp* (`p6_ramp.py`, numbers only: the formats' rounding of a 0..1 ramp, the largest error in 1/255):

| format | channel | < 1/16 | 1/16-1/8 | 1/8-1/4 | 1/4-1/2 | 1/2-1 | levels in a smooth 0.5..1 gradient |
|---|---|---|---|---|---|---|---|
| RGBA8 | all | 0.50 | 0.50 | 0.50 | 0.50 | 0.50 | 128 |
| RGBA16F | all | 0.00 | 0.01 | 0.02 | 0.03 | 0.06 | 1,025 |
| R11F_G11F_B10F | R, G (6-bit mantissa) | 0.06 | 0.12 | 0.25 | 0.50 | 1.00 | 65 |
| R11F_G11F_B10F | B (5-bit mantissa) | 0.12 | 0.25 | 0.50 | 1.00 | 1.99 | 33 |

The intermediates hold display values (gamma-encoded), so 8 bit's even steps are already perceptual; a float format
gives its precision to the darks.  R11F_G11F_B10F is finer than 8 bit below a quarter and coarser above a half: a
bright sky-like gradient gets 65 steps in red and green and 33 in blue where 8 bit had 128, and the exposure (up to
x1.8) and the grade come after it.  No sign either (a negative colour becomes 0, as at 8 bit; RGBA16F keeps it).  In
one respect it is better than 8 bit: a trail that fades by 0.9 a frame keeps its hue (after 40 frames 0.96 / 0.99 /
0.96 of the exact colour per channel; 8 bit 1.18 / 1.77 / 3.54 -- the last steps of 8-bit trails stall).  **Not
taken:** it gives back the bandwidth (~0.07 ms) and ~240 MB, but it would trade the precision the 16-bit targets
were made for (section (69) L1: "no longer rounded to 1/255 before the grade") for banding in the highlights.  An
option for a GPU short of memory, if the user wants one: the switch exists; it is not in the menu.

### P6 (c) -- the mipmaps

Of the twelve `glGenerateMipmap` calls, nine run once (allocation, a resize, a photo upload, the title, the photo-B
copy); three run every frame: the present source's chain (`present:mips`), the limiter's measure frame (16 bit only,
inside `present:measure`), and the finished scene while an FX that samples it at explicit levels (FxChain) is on
screen.  `present:mips` is 0.05 ms at 8 bit and 0.055 at 16 -- the chain is not bound by the format -- and every
level of it is read: level 2 by the bloom's first pass (its quarter-size fragments step 4 texels, so the hardware
picks level 2), levels 4..5 by Present.frag's halation and fallbacks (`texture( tex, puv, 4.0/4.5/5.0 )`), level 8
by the picture guard, the top by the OSC mean, levels 8 and 10 by the limiter at 8 bit.  Nothing to leave out there,
and the bloom's chain cannot stand in for it (its first pass keeps only the bright part).

The measure frame can shrink: the limiter reads its levels 8 and 10 (2880 x 1620), never the frame-sized one.  Now
it is drawn at a quarter of the size, each texel the mean of its 4 x 4 measured pixels -- what the frame-sized
target's level 2 held -- and the limiter reads two levels lower (`m_measureShift`); its levels have the same sizes.
`KALEIDO_MEASURE_FULL=1` keeps the frame-sized target (one pixel per texel: the old computation exactly).  Below 64
pixels a side it measures pixel by pixel.

### P6 (d) -- the exposure histogram and the limiter, run in parallel

*The histogram* (Engine/CfxHistogram.comp) has two stages now, two dispatches of the same program (`stage`).  Stage
0: one work group per 64 x 64 tile of the frame; its 16 x 16 invocations take the tile's top-left 16 x 16 pixels --
exactly the pixels the single work group's strided walk took (x, y = invocation + 64 k) -- into a shared histogram,
which is added to the frame's bins (a new 1 KB buffer on binding 4, `m_histBinsBuf`).  Stage 1: one work group reads
the bins (and clears them for the next frame); invocation 0 then runs the old percentile, smoothing and slew code
unchanged.  The histogram is integer counts of the same samples, so the percentiles and the gain are the same
numbers.  *The limiter* (Engine/SafetyLimit.comp): one work group of 128 invocations, one per flashing-area cell --
each cell reads and writes only its own reference, direction, rate and eight ages -- the cells' luminances in shared
memory, the hot cells counted with an atomic; then invocation 0 alone takes the mean, sums the nine quarter windows
from the shared luminances in the same order as before, and sets the scale.  No C++ change for the limiter (still one
dispatch of one work group).

*Proof by export* (Tools/flash_count.py's render: the video export on the frame clock, the screening music, seed 7,
one photo, 10 s at 60 fps, `KALEIDO_EXPOSURE_DEBUG` logging gain, p50, p98, the limiter's scale, the hazard dimming
and its state every third frame).  The old code twice: ChainLab2D, HarmonicRings, ParticleTunnelFlight (10 hazard
frames) and VolumetricFire framemd5- and log-identical to each other -- the export is deterministic.  The new code
with `KALEIDO_MEASURE_FULL=1`: all four framemd5-identical to the old (600 frames each) and all 400 log lines each
identical.  So the parallel histogram and limiter give exactly the old numbers.  With the quarter measure frame
(c): ChainLab2D and HarmonicRings identical (no light above 1: the measure is the frame either way); ParticleTunnelFlight
and VolumetricFire: gain identical, the limiter's scale within 0.001, the same 10 hazard frames, the encoded video
0.7 and 1.4 of 255 apart on average (H.264 spreads a 0.1 % scale difference).  Snapshots (frozen, silent): 16 scenes
before; the five with light above 1 (ParticleTunnelFlight, CymaticsPlate, VolumetricFire, ChladniAcousticPlate,
FractalBloom) with the full and with the quarter measure: 0 of 5 changed against the before set either way.

*A second trap.*  The first after-run took `const ivec2 p0 = ivec2( gl_FragCoord.xy ) * cellSize;` in
LightMeasure.frag -- a const with a non-constant initialiser, a compile error in GLSL 3.30 on NVIDIA -- and the
present pass fell back to reading the raw 16-bit frame, as before L1's measure frame existed: ParticleTunnelFlight
then had 42 hazard frames instead of 10, and its snapshot differed by 2.68.  shadercheck found it (C1); fixed (no
`const`), the exports and snapshots above are after the fix.  The after-timings below are from that run: their
`measure` is the fallback (0.001), so add the quarter measure frame's own cost (not measured separately; a 720 x 405
pass reading the frame once, expected ~0.02 ms) and its 3 MB.

*After* (`p6_after`: perf_labs --passes --gpumem, the same settings as (a); the GPU was not idle -- the user had a game
open, 4..35 % load before the runs):

| scene | frame 16 bit before -> after | limit | expo | GPU MB 16 bit before -> after | frame 8 bit before -> after |
|---|---|---|---|---|---|
| ChainLab2D | 1.00 -> 0.61 | 0.085 -> 0.023 | 0.208 -> 0.021 | 1143 -> 1092 | 0.83 -> 0.51 |
| TunnelPlain | 0.71 -> 0.33 | 0.087 -> 0.022 | 0.203 -> 0.017 | 1052 -> 1002 | 0.54 -> 0.29 |
| ParticleTunnelFlight | -> 0.50 | -> 0.021 | -> 0.021 | 1209 -> 1122 | |
| VolumetricFire | -> 2.09 | -> 0.037 | -> 0.033 | 1208 -> 1122 | |
| Spaceship | -> 0.57 | -> 0.021 | -> 0.015 | 1296 -> 1209 | |
| MeshTuningForks | -> 0.60 | -> 0.021 | -> 0.015 | 1257 -> 1170 | |

(The memory after is without the measure frame, see the trap; with the quarter one add 3 MB: -47 MB on 2D scenes;
the 3D scenes' -87 MB also contain run-to-run differences of the driver.)  The chain set at 16 bit, median GPU ms
against (70)'s numbers: ChainLabTunnel 1.35 -> 0.97, ChainP4mSpiralKaleidoWarp 0.77 -> 0.44, ChainWaveDrosteHex
0.73 -> 0.39; ChainLab3D 3.30 -> 3.64 and ChainSlice3D 2.19 -> 2.40 came out slower -- the busy GPU (31 % before the
run); their scene passes dominate and were not changed.  120 fps median everywhere.  Self test 182 passed, 0 failed;
shadercheck of the three shaders 0/0 (after the fix); doxygen 0 C++ and 0 shader warnings; cgvr_format and
doc_shaders unchanged.

*Not verified:* a 30-min soak (no target format changed; the measure target's size did); a clean after-timing on an
idle GPU; the 8-bit fallback and Mesa (CI); the GPU memory with the quarter measure frame in place.

*Tried and dropped:* skipping OverlayBlend's second read when the FX stand (interpolation 1): 0.02 ms at 16 bit, but
`mix()` may compile to `x + ( y - x ) * a`, one ulp off -- not bit-identical by construction, and a stale NaN in the
unused target would still be read; left alone.

## P8a -- live depth: Depth Anything V2 Small on the GPU, beside the app

Measurement only; nothing in the app.  The question (plan P8): can a webcam or Spout picture get a depth map 10 to 15
times a second without the app falling below 100 fps, and what would it add to the packages?

*The model.*  Depth Anything V2 Small (Apache-2.0, the revision Tools/depth_maps.py pins, section (69) T0), exported as
agent "maps" did for T5 -- TorchScript exporter, opset 17 -- at fixed square inputs of 252, 392 and 518 px (18, 28
and 37 patches of 14) into `kaleido-wt\depthsrc\onnx_p8a\` (the 518 file of T5 left as it was), each also as fp16
(onnxruntime's `float16.convert_float_to_float16`, inputs and outputs kept float32).  99.1 MB fp32, 49.8 MB fp16 at
every size (the weights do not depend on it); largest difference to torch 1.1e-6 .. 4.0e-6 relative.

*The runtimes* (PyPI only, each `uv pip install --target kaleido-wt\depthenv_ort\<name> --no-deps` and put first on
the path of `depthenv`'s Python -- so the environment's own onnxruntime 1.32.0 (CPU) stayed as it was):

| package | execution provider | Windows DLLs | Linux | licence (as the wheel states it) |
|---|---|---|---|---|
| onnxruntime-gpu 1.26.0 (the last CUDA 12 build; 1.27 on are CUDA 13) | CUDA | onnxruntime.dll 16.4 MB + onnxruntime_providers_cuda.dll 340.6 MB, plus the CUDA 12 runtime, cuBLAS, cuDNN 9, cuFFT, cuRAND: 2,085 MB (here borrowed from torch's lib folder) | manylinux wheel 251 MB (1.32), the same NVIDIA libraries | ORT: MIT ("MIT License / Copyright (c) Microsoft Corporation", LICENSE in the wheel); the NVIDIA libraries under NVIDIA's own licences (not read here) |
| onnxruntime-directml 1.24.4 (the last on PyPI, while onnxruntime itself is at 1.32) | DirectML (D3D12: NVIDIA, AMD, Intel) | onnxruntime.dll 21.1 MB + DirectML.dll 18.5 MB | none (Windows only) | ORT: MIT; DirectML.dll ships in the MIT-labelled wheel without a licence text of its own -- its redistribution terms are Microsoft's and were not checked (PyPI only) |
| onnxruntime-webgpu 1.27.0 | WebGPU (Dawn: D3D12 on Windows, Vulkan on Linux) | onnxruntime.dll 24.3 MB + dxcompiler.dll 17.7 MB + dxil.dll 1.5 MB | manylinux wheel 25 MB | ORT: MIT; Dawn: BSD-3-Clause ("Copyright 2017-2023 The Dawn & Tint Authors", ThirdPartyNotices.txt); dxcompiler/dxil.dll (the DirectX shader compiler) not named in the notices -- to be checked |

*The run* (`p8a_bench.py` per runtime, one lock hold "exclusive", 14:38-14:50; the app beside it: ChainLab2D live with
the review music, `KALEIDO_FPS_LOG`, `KALEIDO_GPU_TIMING`, 16-bit default; the input a webcam-like 1280 x 720 frame
resized to N x N on the CPU).  The model alone, median ms per frame (input upload and output download included), and
the CPU's resizing:

| runtime | 252 fp32 | 392 fp32 | 518 fp32 | fp16 252 / 392 / 518 | CPU resize 252 / 392 / 518 |
|---|---|---|---|---|---|
| CUDA (1.26.0) | 9.5 | 10.0 | 10.1 | 9.4 / 10.2 / 12.9 | 7.9 / 12.9 / 15.3 |
| DirectML (1.24.4) | 3.3 | 5.3 | 8.7 | 45.5 / 116.7 / 11.1 | 6.1 / 10.4 / 14.5 |
| WebGPU (1.27.0) | 9.3 | 11.2 | 14.6 | does not run (Resize) | 6.3 / 10.1 / 13.4 |
| CPU (T5, 1.32.0, 24 threads) | | | 198 | | |

With the app: 15 depth frames a second (model + resize per frame) and as fast as it goes, the app's per-second fps:

| runtime, size | depth at 15/s: ms per frame | app fps median / min | as fast as it goes: depth/s | app fps median / min |
|---|---|---|---|---|
| CUDA 252 fp32 | 18.8 | 120 / 120 | 33 | 120 / 120 |
| CUDA 392 fp32 | 26.8 | 120 / 117 | 34 | 120 / 120 |
| CUDA 518 fp32 | 28.2 | 118 / 100 | 40 | 120 / 118 |
| CUDA 392 fp16 | 27.3 | 120 / 113 | 39 | 117 / 100 |
| DirectML 252 fp32 | 9.9 | 120 / 120 | 105 | 120 / 120 |
| DirectML 392 fp32 | 16.1 | 120 / 118 | 60 | 120 / 120 |
| DirectML 518 fp32 | 22.4 | 120 / 120 | 45 | 120 / 120 |
| WebGPU 252 fp32 | 16.7 | 120 / 120 | 63 | 120 / 119 |
| WebGPU 392 fp32 | 21.1 | 120 / 120 | 47 | 120 / 120 |
| WebGPU 518 fp32 | 31.6 | 120 / 118 | 22 | 120 / 120 |

(The app alone: 120 / 103..120.  Its GPU time read 0.56..0.9 ms in most phases and 2.8..3.8 ms in a few -- the lab's
walk, not the model: the same phases as fast as it goes read lower.  The user's game was open on the GPU, 29..39 %
load with the app alone.)

*Quality* (`p8a_quality.py`, CUDA; sheet `C:\Users\Rene\Desktop\kaleido-wt\sheets\p6\p8a_live_depth_quality.jpg`).
No video of the user's is in the project's `.screen` (only the app's own transtest.mp4), so: matplotlib's sample
portrait (grace_hopper.jpg, a person before a flag -- webcam-like), a frame of the app's own render (Spout-like), and
the snapshot photo; each made webcam-like (16:9 crop, 640 x 360 and back up, noise sigma 3/255, JPEG 75).  The person
separates cleanly from the background at all three sizes; 252 loses the crystal facets of the photo (a blur with a
dark centre), 392 shows them, 518 sharpest.  Flicker of a still camera (30 frames, fresh noise each; mean change of
the stretched map per frame): portrait 0.4..0.65 %, photo 0.3..1.1 %, render 2.2..2.8 % -- after an exponential
smoothing with weight 0.3: 0.1..0.7 %.  fp16 against fp32: 0.03..0.2 % of the range.

*Answer.*  Yes: 10..15 depth frames a second are within reach of every GPU runtime at every size, and the app stayed
at its 120 fps median in all of them; its minimum touched 100 in two phases (CUDA 518 at 15/s, CUDA 392 fp16 flat
out), never below.  DirectML is the fastest here (3.3 ms at 252, 8.7 at 518, model alone), WebGPU close behind and
the only small runtime that also runs on Linux (Vulkan); CUDA is no faster on this machine and costs 2.4 GB.  The
CPU's resizing (6..15 ms, bicubic in Python) is more than the model on DirectML: in the app it belongs on the GPU (the
frame is a texture already).  fp16 gains nothing here (DirectML slower, WebGPU fails), halves the file only.  For
P8b, if the user wants it: 392 px, fp32, WebGPU (Windows + Linux, +44 MB + 99 MB model) or DirectML (Windows, +40 MB),
the resize on the GPU, the map smoothed in time.  Before shipping: the licence terms of DirectML.dll and of
dxcompiler/dxil.dll (not in the wheels).

*Not measured:* other GPUs (an integrated or older card would be the real test of "beside the app"), the Linux
WebGPU build, a real webcam stream, the C/C++ API (the Python wheels' DLLs are the same libraries).

### For the user

- R11F_G11F_B10F as an option for small GPUs (half the extra memory, banding in the highlights): the switch exists
  (`KALEIDO_HDR_FORMAT=r11`), not in the menu.
- P8b (live depth for webcam and Spout): feasible as measured above; your decision.

### Files

C++: Source/glcore.h, glcore.cpp, glwidget.cpp (the pass timer), RenderPipeline.cpp (marks, `hdrFormat()`),
PresentPass.cpp/.h; shaders: Engine/CfxHistogram.comp, SafetyLimit.comp, LightMeasure.frag; Tools/perf_labs.py.  The
measuring scripts (p6_measure, p6_ident, p6_identcmp, p6_ramp, p8a_export, p8a_bench, p8a_quality) stayed in the
session's scratchpad; the ONNX files in `kaleido-wt\depthsrc\onnx_p8a\`, the runtimes in `kaleido-wt\depthenv_ort\`.
