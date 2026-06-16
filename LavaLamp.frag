// LavaLamp.frag
// -----------------------------------------------------------------------
// Classic lava lamp: slow rising / sinking metaball "wax" blobs that merge
// and split in a warm lit vessel.  Inspired by the object, but driven by the
// music: bass = heat/buoyancy (blobs rise faster & swell), beat & onset pop
// the blobs, treble shimmers the rim, the harmony tints the wax, and the whole
// field bobs gently in tempo.  Motion uses the jump-free integrated phases.
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

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    float aspect = resolution.x / resolution.y;
    vec2 p = vec2((uv.x - 0.5) * aspect, uv.y);   // y in 0..1, x centred

    // Circulation speed: calm when quiet, livelier with energy.  The audio-rate
    // part comes from the integrated advance, not from time*audio (anti-flicker).
    float drift = time * 0.05 + audioAdvance * 0.30;
    float buoy  = 0.5 + 0.9 * audioBass + 0.6 * audioArousal;

    // Whole field bobs gently in tempo.
    float bob = 0.015 * sin(audioBeatPhase * 6.2831);

    // Metaball field: a handful of blobs at staggered phases.
    float field = 0.0;
    for (int i = 0; i < 6; i++)
    {
        float fi  = float(i);
        float ph  = drift * (0.5 + 0.18 * fi) * buoy + fi * 1.7;
        float by  = 0.5 + 0.42 * sin(ph) + bob;
        float bx  = 0.33 * aspect * sin(ph * 0.7 + fi);
        // Size: bass swells all blobs; beat + onset give a sharp pop.
        float rad = 0.10 + 0.03 * sin(ph * 1.3)
                  + 0.06 * audioBass + 0.04 * audioBeat + 0.05 * audioOnset;
        vec2  d   = p - vec2(bx, by);
        field += rad * rad / (dot(d, d) + 0.0006);
    }
    // Fat heated pool at the base, swelling with the deepest bass.
    {
        vec2 d = p - vec2(0.0, -0.05 + 0.07 * audioSubBass);
        field += (0.18 * 0.18) / (dot(d, d) + 0.002);
    }

    float m = smoothstep(0.8, 1.4, field);        // blob surface mask

    // Backdrop brightness breathes with the overall level.
    vec3 bg = mix(vec3(0.10, 0.02, 0.16), vec3(0.02, 0.03, 0.10), uv.y)
            * (0.8 + 0.5 * audioLevel);

    // Wax colour: warm base, toward pink with valence, cooler glints when bright.
    vec3 lava = mix(vec3(1.0, 0.35, 0.08), vec3(1.0, 0.85, 0.20),
                    0.5 + 0.5 * sin(field * 1.5 + audioPhase * 0.3));
    lava = mix(lava, vec3(0.9, 0.2, 0.6), 0.4 * audioValence);
    lava = mix(lava, vec3(0.3, 0.7, 1.0), 0.3 * audioCentroid);

    float shade = smoothstep(1.0, 2.5, field);    // fake interior shading
    vec3  col   = mix(bg, lava * (0.6 + 0.7 * shade), m);

    // Glowing rim: shimmers with treble, brighter on beats / onsets.
    float rim     = smoothstep(0.8, 1.0, field) * (1.0 - smoothstep(1.4, 1.9, field));
    float shimmer = 1.0 + 0.6 * audioHigh * sin(field * 30.0 + time * 3.0);
    col += lava * rim * (0.5 + audioBeat + 0.5 * audioOnset) * shimmer;

    // A touch of the source image tints the wax.
    col = mix(col, col * (0.6 + texture2D(tex0, uv).rgb), 0.12 * m);

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
