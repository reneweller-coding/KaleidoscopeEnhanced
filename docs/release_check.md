# Release check 2026-10-18 16:43

**RED** -- 3 red step(s)

| Step | State | Result | Time |
|---|---|---|---|
| selftest | green | 122 passed, 0 failed | 0 min |
| schedule | green | schedule: 20 plan(s), 0 with violations | 1 min |
| rules | RED | temporal_budget ok; uniform types ok; enum tables ok; strings ok; mood tags ok; shake RED (shake baseline: 1 new SHAKE/FRAME/STEP hit(s), 73 known) | 0 min |
| buildlists | green | build lists: in step (54 sources, 55 headers); settings path: one access point (SettingsFile::path()) | 0 min |
| analyzer | green | chord changes seen  24 of 38, 4 false alarm(s) / drops seen          3 of 3, 0 false / tempo               128.0 BPM (128), 120.0 BPM (120) / analyzer: as the baseline | 0 min |
| shaders | green | shadercheck: 2057 file(s), 0 error(s), 0 warning(s) | 0 min |
| shaderdoc | RED | would change 60 shader file(s) | 0 min |
| layout | RED | files: 2304  changed 31  same 2273 | 0 min |
| doxygen | green | C++: 0 warning(s); shaders: 0 warning(s) | 1 min |
| chain | green | 0 of 10 combinations differ | 11 min |
| perf | green | ChainLab2D 120 fps, GPU p90 0.95 ms; ChainLabTunnel 120 fps, GPU p90 1.28 ms; ChainLab3D 120 fps, GPU p90 3.42 ms; ChainSlice3D 120 fps, GPU p90 2.40 ms; Chain3DKifsTetra 120 fps, GPU p90 1.38 ms; Chain3DMandelbox 120 fps, GPU p90 2.05 ms; Chain3DOctaGyroid 120 fps, GPU p90 1.26 ms; Chain3DPolarTunnelBoxes 120 fps, GPU p90 1.27 ms; Chain3DTwistTorus 120 fps, GPU p90 1.35 ms; ChainP4mSpiralKaleidoWarp 120 fps, GPU p90 0.62 ms; ChainWaveDrosteHex 120 fps, GPU p90 0.56 ms | 6 min |
