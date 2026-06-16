// Present.frag
// Final present pass.  Two jobs:
//  1) A GLOBAL MOOD GRADE applied once to the finished frame, so EVERY effect
//     (not just Tunnel/Kaleidoscope) reacts to the music's mood:
//       audioCentroid -> colour temperature (dark=cool blue, bright=warm amber)
//       audioValence  -> saturation (minor/rough muted, major/consonant vivid)
//       audioLevel    -> brightness (loudness)
//       audioFlux     -> shimmer on spectral change
//     The host feeds GATED values, so in non-music mode they sit at neutral
//     (centroid/valence 0.5, level/flux 0) and the grade is a no-op.
//  2) The photosensitivity brightness limit (uniform `scale`), applied last.
uniform sampler2D tex;
uniform vec2  resolution;
uniform float scale;

uniform float audioCentroid;
uniform float audioValence;
uniform float audioLevel;
uniform float audioFlux;

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    vec3 c  = texture2D(tex, uv).rgb;

    // Colour temperature (centred so centroid 0.5 ≈ neutral).
    vec3 cool = vec3(0.65, 0.85, 1.30);
    vec3 warm = vec3(1.35, 1.10, 0.70);
    c *= mix(cool, warm, audioCentroid);

    // Saturation from valence (centred so 0.5 ≈ neutral).
    float lum = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(vec3(lum), c, 0.45 + 1.10 * audioValence);

    // Loudness → brightness, spectral flux → shimmer.
    c *= (1.0 + 0.55 * audioLevel + 0.30 * audioFlux);

    // Photosensitivity brightness limit (applied last).
    gl_FragColor = vec4(clamp(c * scale, 0.0, 1.0), 1.0);
}
