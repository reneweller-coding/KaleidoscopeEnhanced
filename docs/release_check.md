# Release check 2026-11-27 09:15

**RED** -- 3 red step(s)

| Step | State | Result | Time |
|---|---|---|---|
| selftest | green | 180 passed, 0 failed | 0 min |
| schedule | green | schedule: 20 plan(s), 0 with violations | 1 min |
| rules | green | temporal_budget ok; uniform types ok; enum tables ok; strings ok; mood tags ok; shake ok | 0 min |
| buildlists | green | build lists: in step (55 sources, 59 headers); settings path: one access point (SettingsFile::path()) | 0 min |
| analyzer | green | chord changes seen  24 of 38, 4 false alarm(s) / drops seen          3 of 3, 0 false / tempo               127.9 BPM (128), 120.0 BPM (120) / analyzer: as the baseline | 0 min |
| transitions | green | profile: 210 measured, 0 differ from the table / transcheck: 210 checked, 0 failed | 1 min |
| shaders | green | shadercheck: 3223 file(s), 0 error(s), 0 warning(s) | 1 min |
| shaderdoc | RED | would change 1 shader file(s) | 0 min |
| layout | RED | files: 3515  changed 1  same 3514 | 0 min |
| doxygen | RED | C++: 1 warning(s); shaders: 85 warning(s) | 2 min |
| chain | green | 0 of 12 combinations differ | 13 min |
| perf | green | ChainLab2D 120 fps, GPU p90 0.88 ms; ChainLabTunnel 120 fps, GPU p90 1.36 ms; ChainLab3D 120 fps, GPU p90 4.04 ms; ChainSlice3D 120 fps, GPU p90 2.42 ms; Chain3DKifsTetra 120 fps, GPU p90 1.40 ms; Chain3DMandelbox 120 fps, GPU p90 2.13 ms; Chain3DOctaGyroid 120 fps, GPU p90 1.26 ms; Chain3DPolarTunnelBoxes 120 fps, GPU p90 1.63 ms; Chain3DTwistTorus 120 fps, GPU p90 1.46 ms; ChainP4mSpiralKaleidoWarp 120 fps, GPU p90 0.61 ms; ChainWaveDrosteHex 120 fps, GPU p90 0.59 ms | 6 min |
