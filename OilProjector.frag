// OilProjector.frag
// -----------------------------------------------------------------------
// 1960s liquid light-show / Mathmos Space Projector: two immiscible coloured
// liquids on a slowly rotating, heated glass wheel form swirling cells that
// merge, stretch and drift, separated by dark oil veins.  Inspired by the
// object, extended with the music: bass + onset are the "heat" that makes it
// bubble, the beat gives an in-tempo zoom pulse, treble crisps the veins, the
// stereo image skews the flow left/right, and the harmony drives the palette.
// Rotation/evolution use the jump-free integrated phases (anti-flicker).
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;     // integrated rotation phase (jump-free)
uniform float audioAdvance;   // integrated evolution drift (audio-rate)
uniform float audioBass;
uniform float audioBeat;
uniform float audioBeatPhase;
uniform float audioOnset;
uniform float audioValence;
uniform float audioCentroid;
uniform float audioUpperMid;
uniform float audioStereo;
uniform float audioChromaHue;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

float noise(vec2 p)
{
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i), b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p)
{
    float v = 0.0, amp = 0.5;
    for (int i = 0; i < 4; i++) { v += amp * noise(p); p *= 2.0; amp *= 0.5; }
    return v;
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p  = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // The glass wheel rotates slowly; an in-tempo zoom pulse breathes the cells.
    p = rot(time * 0.05 + audioPhase * 0.18) * p;
    p *= 1.0 - 0.06 * audioBeat - 0.03 * sin(audioBeatPhase * 6.2831);

    // Heat-driven bubbling: a slowly evolving domain warp (audio-rate via advance).
    float t    = time * 0.08 + audioAdvance * 0.30;
    float heat = 0.6 + 1.4 * audioBass + 0.7 * audioOnset;

    // Stereo image skews the warp left vs. right.
    vec2 asym = vec2(audioStereo * 0.4 * sin(p.y * 3.0 + t), 0.0);
    vec2 q    = vec2(fbm(p * 2.0 + vec2(0.0, t) + asym),
                     fbm(p * 2.0 + vec2(5.2, t * 1.1) - asym));
    vec2 r    = p * 2.5 + heat * q + vec2(t * 0.5, 0.0);
    float cells = fbm(r * 1.5);

    // Dark oil veins along the cell boundaries (crisper with treble).
    float vein = smoothstep(0.45, 0.50, abs(cells - 0.5) * 2.0);

    // Saturated, drifting palette tied to the harmony.
    float hue = fract(cells * 1.2 + audioChromaHue + 0.3 * audioValence);
    vec3  col = 0.5 + 0.5 * cos(6.2831 * (hue + vec3(0.0, 0.33, 0.67)));
    col = mix(col, col * col, audioCentroid * 0.5);   // deepen with brightness
    col *= (0.5 + 0.8 * cells);
    col *= mix(0.12, 1.0, vein);                       // veins darken
    col *= 1.0 - 0.4 * audioUpperMid * (1.0 - vein);   // treble sharpens veins
    col += (audioBeat * 0.20 + audioOnset * 0.30) * col;   // beat / onset bloom

    col = mix(col, col * (0.5 + texture2D(tex0, uv).rgb), 0.10);

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
