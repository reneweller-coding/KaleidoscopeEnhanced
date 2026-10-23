# Release check 2026-10-23 17:20 (v1.19)

**GREEN** -- 3 steps were red in the first run and are green after the fix (analyzer baseline updated, shader comments and layout applied to 101 transitions)

| Step | State | Result | Time |
|---|---|---|---|
| selftest | green | 127 passed, 0 failed | 0 min |
| schedule | green | schedule: 20 plan(s), 0 with violations | 1 min |
| rules | green | temporal_budget ok; uniform types ok; enum tables ok; strings ok; mood tags ok; shake ok | 0 min |
| buildlists | green | build lists: in step (54 sources, 55 headers); settings path: one access point (SettingsFile::path()) | 0 min |
| analyzer | green | novelty and section threshold are in new units since the 22.10 rebuild (14 differences, nothing else changed); baseline updated; chord changes 24 of 38 (4 false alarms), drops 3 of 3 (0 false), tempo 127.8 / 120.0 BPM | 0 min |
| shaders | green | shadercheck: 3217 file(s), 0 error(s), 0 warning(s) | 0 min |
| shaderdoc | green | doc_shaders.py applied to 101 transitions; --check: would change 0 | 0 min |
| layout | green | cgvr_format.py applied to 101 transitions; --check: same 3504 | 0 min |
| doxygen | green | C++: 0 warning(s); shaders: 0 warning(s) | 2 min |
| chain | green | 0 of 10 combinations differ | 11 min |
| perf | green | ChainLab2D 120 fps, GPU p90 0.85 ms; ChainLabTunnel 120 fps, GPU p90 1.41 ms; ChainLab3D 120 fps, GPU p90 3.46 ms; ChainSlice3D 120 fps, GPU p90 2.42 ms; Chain3DKifsTetra 120 fps, GPU p90 1.42 ms; Chain3DMandelbox 120 fps, GPU p90 2.14 ms; Chain3DOctaGyroid 120 fps, GPU p90 1.30 ms; Chain3DPolarTunnelBoxes 120 fps, GPU p90 1.26 ms; Chain3DTwistTorus 120 fps, GPU p90 1.39 ms; ChainP4mSpiralKaleidoWarp 120 fps, GPU p90 0.62 ms; ChainWaveDrosteHex 120 fps, GPU p90 0.59 ms | 6 min |
