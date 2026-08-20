#version 330 core
out vec4 fragColor;
// Frag-side music pulse (added by the deaf-scene pass: reactivity
// measured ~0 -- the vert-side coupling barely moved any pixels).
uniform float audioLevel;
uniform float audioKick;
// SciFiHUD.frag — crisp glowing HUD line: bright core, soft halo.  vCol
// already carries the vertex shader's fade (crosshair gaps, sweep trail,
// lock-ring pulses) baked in.
in vec4  vCol;
in float vSide;

/**
 * @file SciFiHUD.frag
 * @brief Shades the 20 ribbons of the diegetic sci-fi cockpit HUD (bezel
 * rings, radar sweep, live oscilloscope trace, spectrum arc, compass ticks,
 * target reticle with corner brackets, onset lock-on rings) as crisp glowing
 * lines: a bright core plus a soft halo, using vSide as the distance from
 * the ribbon's centreline. vCol already carries the vertex shader's fade
 * (crosshair gaps, sweep trail, lock-ring pulses) baked in.
 *
 * audioLevel and audioKick give this fragment stage its own extra pulse on
 * top of vCol — added after a reactivity pass found the vertex-side coupling
 * alone barely moved any pixels. The HUD's real audio response (the live
 * waveform trace from audioWave, the spectrum arc from audioSpectrum, lock-on
 * pulses from audioOnset, sweep/hue drift from audioAdvance/audioChromaHue)
 * is computed in SciFiHUD.vert.
 */

void main()
{
    float d    = abs(vSide);
    float core = exp(-d * d * 30.0);
    // Slightly fuller halo: the strokes are still thin glowing lines on a dark
    // canopy, and the halo is what stops them aliasing away to nothing.
    float halo = exp(-d * d * 6.0) * 0.45;
    vec3 c = vCol.rgb * (core + halo)
           * (1.05 + 0.30 * audioLevel + 0.35 * audioKick);
    // The strokes are much wider now, so their cores cover real area instead of
    // a hairline.  Roll the whole colour back together once it would clip, so a
    // hot line stays a bright CYAN line rather than turning into a white one.
    float m = max(c.r, max(c.g, c.b));
    c *= (m > 0.94) ? (0.94 / m) : 1.0;
    fragColor = vec4(c, 1.0);
}
