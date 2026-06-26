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
uniform float time;             // for the slow moving-head beam sweep
uniform float audioChase;       // 0..1, steps 1/4 each onset → corner-cone colour chase

float hash21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

// Hue rotation around the (1,1,1) luminance axis (Rodrigues), turns in [0,1].
vec3 hueRotate(vec3 c, float turns)
{
    float a = turns * 6.28318530718;
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

vec2 rot2(vec2 v, float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c) * v; }

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

    // Tone-down: the source frames are often very bright/pale, washing the whole
    // image out.  Cut the exposure and deepen the mid-tones for richer colour
    // (most effective on the near-white areas).
    c = pow(max(c, 0.0) * 0.78, vec3(1.25));

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

        // Vivid mood colour (centroid temperature, valence saturation).
        vec3  moodCol = mix(vec3(0.25, 0.55, 1.0), vec3(1.0, 0.55, 0.20), audioCentroid);
        float sl      = dot(moodCol, vec3(0.299, 0.587, 0.114));
        moodCol       = mix(vec3(sl), moodCol, 0.75 + 0.5 * audioValence);

        // Beat/onset pulse with a modest always-on base.
        float pulse  = clamp(0.16 + 1.0 * audioBeat + 0.6 * audioDownbeat
                                  + 0.7 * audioOnset, 0.0, 1.0);
        float spread = 0.52;     // cone half-width factor (thick beams)
        float reach  = 0.38;     // short, so the thick cones stay in the corner regions

        vec2 c0 = vec2(0.0,    0.0);
        vec2 c1 = vec2(aspect, 0.0);
        vec2 c2 = vec2(0.0,    1.0);
        vec2 c3 = vec2(aspect, 1.0);

        // Moving-head sweep (fixed rate, phase-offset per corner, wider when loud).
        float swAmp = 0.55 + 0.35 * audioLevel;
        float swRate = 0.5;
        vec2 d0 = rot2(normalize(ctr-c0), swAmp * sin(time * swRate + 0.0));
        vec2 d1 = rot2(normalize(ctr-c1), swAmp * sin(time * swRate + 1.7));
        vec2 d2 = rot2(normalize(ctr-c2), swAmp * sin(time * swRate + 3.3));
        vec2 d3 = rot2(normalize(ctr-c3), swAmp * sin(time * swRate + 5.0));

        // Colour CHASE: emphasis cycles through the corners (audioChase steps 1/4
        // on each onset).  Non-active corners keep a 0.45 base so all stay alive.
        float cw0 = 0.45 + 0.55 * (1.0 - smoothstep(0.0, 0.25, abs(fract(audioChase - 0.00 + 0.5) - 0.5)));
        float cw1 = 0.45 + 0.55 * (1.0 - smoothstep(0.0, 0.25, abs(fract(audioChase - 0.25 + 0.5) - 0.5)));
        float cw2 = 0.45 + 0.55 * (1.0 - smoothstep(0.0, 0.25, abs(fract(audioChase - 0.50 + 0.5) - 0.5)));
        float cw3 = 0.45 + 0.55 * (1.0 - smoothstep(0.0, 0.25, abs(fract(audioChase - 0.75 + 0.5) - 0.5)));
        float p0 = pulse * cw0, p1 = pulse * cw1, p2 = pulse * cw2, p3 = pulse * cw3;

        vec3 col0 = hueRotate(moodCol, audioChromaHue + 0.00) * 1.5;
        vec3 col1 = hueRotate(moodCol, audioChromaHue + 0.12) * 1.5;
        vec3 col2 = hueRotate(moodCol, audioChromaHue + 0.25) * 1.5;
        vec3 col3 = hueRotate(moodCol, audioChromaHue + 0.37) * 1.5;

        // Core cone tint (visible over any content).
        c = mix(c, col0, clamp(coneLight(q, c0, d0, spread, reach) * p0, 0.0, 0.88));
        c = mix(c, col1, clamp(coneLight(q, c1, d1, spread, reach) * p1, 0.0, 0.88));
        c = mix(c, col2, clamp(coneLight(q, c2, d2, spread, reach) * p2, 0.0, 0.88));
        c = mix(c, col3, clamp(coneLight(q, c3, d3, spread, reach) * p3, 0.0, 0.88));

        // Volumetric HAZE: a wide, soft additive glow around each beam, as if the
        // light scatters in stage fog (makes the beams look 3-D).
        float hz = 0.14;
        c += col0 * coneLight(q, c0, d0, spread*1.7, reach*1.6) * p0 * hz;
        c += col1 * coneLight(q, c1, d1, spread*1.7, reach*1.6) * p1 * hz;
        c += col2 * coneLight(q, c2, d2, spread*1.7, reach*1.6) * p2 * hz;
        c += col3 * coneLight(q, c3, d3, spread*1.7, reach*1.6) * p3 * hz;

        // MIRROR-BALL speckle: a slowly rotating field of soft twinkling light dots
        // (disco-ball), music-gated so it fades in with the music.
        vec2 mb   = rot2(uv - 0.5, time * 0.06);
        vec2 cell = mb * vec2(16.0, 9.0);
        vec2 idc  = floor(cell);
        vec2 fc   = fract(cell) - 0.5;
        float dotm = smoothstep(0.42, 0.0, length(fc)) * step(0.62, hash21(idc));
        float tw   = 0.5 + 0.5 * sin(time * 2.5 + hash21(idc) * 31.0);
        c += hueRotate(vec3(0.85, 0.85, 0.95), audioChromaHue + 0.5)
             * dotm * tw * 0.12 * (0.2 + 0.8 * audioLevel);

        // GOBO: a slowly rotating fan of light rays from the centre (gobo wheel),
        // fading in toward the edges so it never washes the middle.
        vec2  g   = q - ctr;
        float ang = atan(g.y, g.x) + time * 0.12;
        float rays = pow(0.5 + 0.5 * cos(ang * 9.0), 6.0);
        c += hueRotate(moodCol, audioChromaHue + 0.6) * 1.3
             * rays * 0.08 * (0.2 + 0.8 * audioLevel) * smoothstep(0.05, 0.45, length(g));
    }

    c *= scale;   // photosensitivity brightness limit (applied last)

    // Ordered dither (interleaved gradient noise) to break up 8-bit banding in the
    // smooth gradients (lava lamp / oil / hypercube).  Spatial only -> flicker-free.
    float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy,
                                             vec2(0.06711056, 0.00583715))));
    c += (ign - 0.5) / 255.0;

    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
