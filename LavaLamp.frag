// LavaLamp.frag
// -----------------------------------------------------------------------
// Classic lava lamp - but now the rising "wax" blobs are LENSES that magnify
// and refract the source image, so the picture drifts and swims inside the wax
// instead of the old flat gradient with a 12% image tint.  The vessel keeps its
// warm identity; the *image* is what floats and merges inside it.  Driven by
// the music: bass = heat/buoyancy (blobs rise faster & swell), beat & onset pop
// the blobs and their lens bulge, treble shimmers the rim, harmony tints the
// wax.  Motion uses the jump-free integrated phases (anti-flicker).
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;     // integrated motion phase (jump-free)
uniform float audioAdvance;   // integrated vertical drift (audio-rate)
uniform float audioSubBass;
uniform float audioBass;
uniform float audioHigh;
uniform float audioBeat;
uniform float audioBeatPhase;
uniform float audioOnset;
uniform float audioArousal;
uniform float audioValence;
uniform float audioCentroid;
uniform float audioLevel;

vec3 img(vec2 uv) { return (interpolation * texture2D(tex0, uv)
                          + (1.0 - interpolation) * texture2D(tex1, uv)).rgb; }

void main()
{
    vec2  uv     = gl_FragCoord.xy / resolution;
    float aspect = resolution.x / resolution.y;
    vec2  p      = vec2((uv.x - 0.5) * aspect, uv.y);   // y in 0..1, x centred

    float drift = time * 0.05 + audioAdvance * 0.30;
    float buoy  = 0.5 + 0.9 * audioBass + 0.6 * audioArousal;
    float bob   = 0.015 * sin(audioBeatPhase * 6.2831);

    // Metaball field + track the nearest blob (centre & radius) for the lens.
    float field = 0.0;
    vec2  nearC = vec2(0.0, 0.5);
    float nearR = 0.12;
    float nearS = 1e9;                 // nearest signed-ish distance
    for (int i = 0; i < 6; i++)
    {
        float fi  = float(i);
        float ph  = drift * (0.5 + 0.18 * fi) * buoy + fi * 1.7;
        float by  = 0.5 + 0.42 * sin(ph) + bob;
        float bx  = 0.33 * aspect * sin(ph * 0.7 + fi);
        float rad = 0.10 + 0.03 * sin(ph * 1.3)
                  + 0.06 * audioBass + 0.04 * audioBeat + 0.05 * audioOnset;
        vec2  d   = p - vec2(bx, by);
        field += rad * rad / (dot(d, d) + 0.0006);
        float sd = length(d) - rad;
        if (sd < nearS) { nearS = sd; nearC = vec2(bx, by); nearR = rad; }
    }
    // Fat heated pool at the base.
    {
        vec2 d = p - vec2(0.0, -0.05 + 0.07 * audioSubBass);
        field += (0.18 * 0.18) / (dot(d, d) + 0.002);
        float sd = length(d) - 0.18;
        if (sd < nearS) { nearS = sd; nearC = vec2(0.0, -0.05); nearR = 0.18; }
    }

    float m = smoothstep(0.8, 1.4, field);         // blob surface mask

    // LENS: inside the nearest blob, pull the image toward the blob centre so
    // the picture magnifies and bulges (stronger on the beat).
    vec2  rel  = p - nearC;
    float lens = smoothstep(nearR * 1.7, 0.0, length(rel));
    vec2  iuv  = uv - rel * (0.45 + 0.25 * audioBeat) * lens;
    vec3  pic  = img(fract(iuv));

    // Warm wax grade over the magnified picture, tinted by harmony/brightness.
    vec3 wax = pic * mix(vec3(1.0, 0.45, 0.15), vec3(1.0, 0.85, 0.30),
                         0.5 + 0.5 * sin(field * 1.5 + audioPhase * 0.3));
    wax = mix(wax, wax * vec3(1.1, 0.5, 0.9), 0.35 * audioValence);
    wax = mix(wax, wax * vec3(0.6, 0.85, 1.15), 0.30 * audioCentroid);
    wax *= (0.7 + 0.9 * audioLevel);

    // Dim image backdrop in the vessel (dark, so the wax reads).
    vec3 bg = img(uv) * 0.12
            + mix(vec3(0.08, 0.02, 0.14), vec3(0.02, 0.03, 0.10), uv.y);

    vec3 col = mix(bg, wax, m);

    // Glowing rim: shimmers with treble, brighter on beats / onsets.
    float rim     = smoothstep(0.8, 1.0, field) * (1.0 - smoothstep(1.4, 1.9, field));
    float shimmer = 1.0 + 0.6 * audioHigh * sin(field * 30.0 + time * 3.0);
    col += wax * rim * (0.4 + audioBeat + 0.5 * audioOnset) * shimmer;

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
