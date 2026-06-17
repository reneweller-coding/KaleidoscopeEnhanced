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
uniform float audioChromaHue;   // harmony → global hue shift (0 = neutral in non-music)
uniform float audioBeat;        // beat → extra bloom on hits

// Hue rotation around the (1,1,1) luminance axis (Rodrigues), turns in [0,1].
vec3 hueRotate(vec3 c, float turns)
{
    float a = turns * 6.28318530718;
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    vec3 c  = texture2D(tex, uv).rgb;

    // Colour temperature (centred so centroid 0.5 ≈ neutral).
    vec3 cool = vec3(0.65, 0.85, 1.30);
    vec3 warm = vec3(1.35, 1.10, 0.70);
    c *= mix(cool, warm, audioCentroid);

    // Harmony → hue shift (the song's key/chords tint the whole palette).
    c = hueRotate(c, audioChromaHue * 0.18);

    // Saturation from valence (centred so 0.5 ≈ neutral).
    float lum = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(vec3(lum), c, 0.45 + 1.10 * audioValence);

    // Loudness → brightness, spectral flux → shimmer (gentle, so already-bright
    // content does not blow out).
    c *= (1.0 + 0.30 * audioLevel + 0.15 * audioFlux);

    // Bloom / glow: a single tap of a coarse, blurred mip level (mipmaps already
    // generated for the safety mean).  Only clearly-bright areas, gently.
    vec3 blurC = texture2D(tex, uv, 4.5).rgb;        // LOD bias → blurred low-res
    vec3 bloom = max(blurC - 0.65, 0.0);             // higher threshold = less wash
    c += bloom * (0.22 + 0.30 * audioBeat);

    // Soft highlight knee: compress values above ~0.8 toward white instead of
    // hard-clipping the whole frame to flat white when the grade pushes it high.
    c = c / (1.0 + max(c - 0.8, 0.0));

    c *= scale;   // photosensitivity brightness limit (applied last)

    // Ordered dither (interleaved gradient noise) to break up 8-bit banding in the
    // smooth gradients (lava lamp / oil / hypercube).  Spatial only -> flicker-free.
    float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy,
                                             vec2(0.06711056, 0.00583715))));
    c += (ign - 0.5) / 255.0;

    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
