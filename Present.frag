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
uniform float audioDownbeat;    // bigger accent on the bar's "1"
uniform float audioOnset;       // full-spectrum onset (snares/claps/melodic) → cone pulse

// Hue rotation around the (1,1,1) luminance axis (Rodrigues), turns in [0,1].
vec3 hueRotate(vec3 c, float turns)
{
    float a = turns * 6.28318530718;
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

// A spotlight CONE emanating from `origin` along `dir`: brightest at the source,
// widening and fading along the beam.  Returns 0..1.
float coneLight(vec2 p, vec2 origin, vec2 dir, float spread, float reach)
{
    vec2  v = p - origin;
    float t = dot(v, dir);                       // distance along the beam
    if (t < 0.0) return 0.0;                      // behind the lamp
    float perp = length(v - t * dir);            // distance from the beam axis
    float halfWidth = spread * (t + 0.04);        // cone widens with distance
    float across = clamp(1.0 - perp / halfWidth, 0.0, 1.0);
    across = across * across;                     // soft edges
    float along = exp(-t / reach) * (0.35 + 0.65 * clamp(1.0 - t * 0.3, 0.0, 1.0));
    return across * along;
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

    // Contrast / gamma: many source images are pale, which washed the whole frame
    // out.  A mild gamma > 1 deepens the mid-tones (richer colour, less white-out)
    // while leaving blacks black.
    c = pow(max(c, 0.0), vec3(1.22));

    // Loudness → brightness, spectral flux → shimmer (kept small so already-bright
    // content does not blow out).
    c *= (1.0 + 0.12 * audioLevel + 0.06 * audioFlux);

    // Bloom / glow: a single tap of a coarse, blurred mip level (mipmaps already
    // generated for the safety mean).  Only clearly-bright areas, gently.
    vec3 blurC = texture2D(tex, uv, 4.5).rgb;        // LOD bias → blurred low-res
    vec3 bloom = max(blurC - 0.75, 0.0);             // higher threshold = less wash on pale content
    c += bloom * (0.12 + 0.05 * audioBeat);          // mostly steady (beat accent is in the spotlights)

    // Soft highlight knee: compress values above ~0.8 toward white instead of
    // hard-clipping the whole frame to flat white when the grade pushes it high.
    c = c / (1.0 + max(c - 0.8, 0.0));

    // --- Corner spotlights (cones) ----------------------------------------------
    // Four stage-light CONES shining from the corners toward the centre, flashing
    // IN TIME with the beat (extra punch on the downbeat), coloured by the mood
    // with a slightly different hue per corner.  Directional, so they read clearly
    // as spotlights yet stay eye-friendly.  audioBeat / audioDownbeat are music-
    // gated upstream, so on speech / silence the lamps stay dark.
    {
        float aspect = resolution.x / resolution.y;
        vec2  q      = vec2(uv.x * aspect, uv.y);
        vec2  ctr    = vec2(aspect * 0.5, 0.5);

        vec3  sBase  = mix(vec3(0.35, 0.55, 1.0), vec3(1.0, 0.65, 0.30), audioCentroid);
        float sl     = dot(sBase, vec3(0.299, 0.587, 0.114));
        sBase        = mix(vec3(sl), sBase, 0.5 + 0.8 * audioValence);   // saturation by valence

        // Pulse: a faint always-on base (so the lamps are visibly present) plus a
        // clear flash on each beat / onset, bigger on the downbeat.  Driven by the
        // full-spectrum onset too, so it pulses even for music without a hard kick.
        // Each cone TINTS toward a bright mood colour (mix, not add), so it shows
        // even over pale content.
        float pulse  = clamp(0.07 + 1.2 * audioBeat + 0.7 * audioDownbeat
                                  + 0.8 * audioOnset, 0.0, 1.0);
        float spread = 0.30;     // cone half-width factor
        float reach  = 0.45;     // how far the beam carries inward

        vec2 c0 = vec2(0.0,    0.0);
        vec2 c1 = vec2(aspect, 0.0);
        vec2 c2 = vec2(0.0,    1.0);
        vec2 c3 = vec2(aspect, 1.0);
        float m0 = clamp(coneLight(q, c0, normalize(ctr-c0), spread, reach) * pulse, 0.0, 0.85);
        float m1 = clamp(coneLight(q, c1, normalize(ctr-c1), spread, reach) * pulse, 0.0, 0.85);
        float m2 = clamp(coneLight(q, c2, normalize(ctr-c2), spread, reach) * pulse, 0.0, 0.85);
        float m3 = clamp(coneLight(q, c3, normalize(ctr-c3), spread, reach) * pulse, 0.0, 0.85);
        c = mix(c, hueRotate(sBase, audioChromaHue*0.10 + 0.00) * 1.5, m0);
        c = mix(c, hueRotate(sBase, audioChromaHue*0.10 + 0.05) * 1.5, m1);
        c = mix(c, hueRotate(sBase, audioChromaHue*0.10 + 0.10) * 1.5, m2);
        c = mix(c, hueRotate(sBase, audioChromaHue*0.10 + 0.15) * 1.5, m3);
    }

    c *= scale;   // photosensitivity brightness limit (applied last)

    // Ordered dither (interleaved gradient noise) to break up 8-bit banding in the
    // smooth gradients (lava lamp / oil / hypercube).  Spatial only -> flicker-free.
    float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy,
                                             vec2(0.06711056, 0.00583715))));
    c += (ign - 0.5) / 255.0;

    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
