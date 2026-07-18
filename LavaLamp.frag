// LavaLamp.frag
// -----------------------------------------------------------------------
// A REAL lava lamp this time: glowing wax blobs rise and sink inside a
// tapered glass vessel over a hot bulb.  What sells the illusion:
//   * blobs ELONGATE while they move and round off at the turnarounds
//     (gooey vertical stretch from their velocity) and wobble slightly;
//   * they merge/split through a shared metaball field;
//   * a bright heated pool sits at the base, lit by a warm bulb glow that
//     breathes with the bass;
//   * the vessel tapers toward the top, with a soft glass rim light.
// The wax LENSES the source image (the picture swims inside the blobs) and
// the wax palette is hue-rotatable per activation.  All motion uses the
// jump-free integrated phases (anti-flicker): sizes breathe only with the
// SLOW swell (+ a whisper of bass), never with per-beat pops.
//
// Music mapping: swell -> wax volume & rise energy (via audioAdvance),
// bass -> bulb glow / pool, beatPhase -> a tiny in-tempo bob,
// valence/centroid -> mood grade, barPhase -> slow liquid hue sweep.
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;     // integrated motion phase (jump-free)
uniform float audioAdvance;   // integrated circulation drift (audio-rate)
uniform float audioSubBass;
uniform float audioBass;
uniform float audioBeat;
uniform float audioBeatPhase;
uniform float audioSwell;
uniform float audioBarPhase;
uniform float audioValence;
uniform float audioCentroid;
uniform float audioLevel;

// Per-activation variety (re-rolled each activation; 0 = default):
uniform float waxHueP;    // wax palette hue rotation (0 -> classic orange; 0..6.28)
uniform float speedP;     // circulation speed multiplier (0 -> 1.0; 0.6..1.6)
uniform float sizeP;      // blob size multiplier         (0 -> 1.0; 0.8..1.4)
uniform int   countP;     // number of blobs              (0 -> 6; 4..8)

vec3 img(vec2 uv) { return (interpolation * texture2D(tex0, uv)
                          + (1.0 - interpolation) * texture2D(tex1, uv)).rgb; }

// Hue rotation around the luminance axis (keeps brightness + saturation).
vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    vec2  uv     = gl_FragCoord.xy / resolution;
    float aspect = resolution.x / resolution.y;
    vec2  p      = vec2((uv.x - 0.5) * aspect, uv.y);   // y in 0..1, x centred

    // Per-activation character (constant during the scene):
    float speedV = (speedP <= 0.01) ? 1.0 : speedP;
    float sizeV  = (sizeP  <= 0.01) ? 1.0 : sizeP;
    float nBlobs = float((countP >= 2) ? countP : 6);

    // Circulation: steady base + host-integrated audio advance (jump-free).
    float drift = (time * 0.05 + audioAdvance * 0.55) * speedV;
    float bob   = 0.010 * sin(audioBeatPhase * 6.2831);   // tiny in-tempo bob

    // Wax volume breathes ONLY with slow signals (per-beat radius pops made
    // the old blobs jitter).
    float volume = sizeV * (1.0 + 0.22 * audioSwell + 0.08 * audioBass);

    // ---- Metaball field of rising/sinking gooey blobs -------------------
    float field = 0.0;
    vec2  nearC = vec2(0.0, 0.5);
    float nearR = 0.12;
    float nearS = 1e9;
    for (int i = 0; i < 8; i++)
    {
        float fi = float(i);
        if (fi >= nBlobs) break;

        float ph  = drift * (0.35 + 0.12 * fi) + fi * 2.39996;   // golden spread
        float cy  = sin(ph);
        float vel = cos(ph);                       // vertical velocity (for goo)
        float by  = 0.52 + 0.34 * cy + bob;
        float bx  = (0.30 - 0.10 * by)             // narrower travel near the top
                  * sin(ph * 0.53 + fi * 1.7) * aspect * 0.62;
        float rad = (0.075 + 0.028 * sin(fi * 2.1 + 1.3)) * volume;

        vec2 d = p - vec2(bx, by);
        // Gooey stretch: moving blobs elongate vertically, resting blobs round.
        d.y /= 1.0 + 0.45 * abs(vel);
        // Slight liquid wobble on the surface (slow, phase-driven).
        d.x += 0.010 * sin(p.y * 16.0 + ph * 2.0 + fi);

        field += rad * rad / (dot(d, d) + 0.0006);
        float sd = length(d) - rad;
        if (sd < nearS) { nearS = sd; nearC = vec2(bx, by); nearR = rad; }
    }
    // Heated wax pool at the base (swells with the sub-bass).
    {
        vec2 d = p - vec2(0.0, -0.06 + 0.05 * audioSubBass);
        d.y *= 0.55;                               // wide, flat pool
        float rp = 0.17 * volume;
        field += rp * rp / (dot(d, d) + 0.002);
        float sd = length(d) - rp;
        if (sd < nearS) { nearS = sd; nearC = vec2(0.0, 0.0); nearR = 0.22; }
    }

    float m = smoothstep(0.85, 1.45, field);       // wax surface mask

    // ---- The wax lenses the picture -------------------------------------
    vec2  rel  = p - nearC;
    float lens = smoothstep(nearR * 1.8, 0.0, length(rel));
    vec2  iuv  = uv - rel * (0.40 + 0.15 * audioBeat) * lens;
    vec3  pic  = img(fract(iuv));

    // Classic wax palette (hot core -> cooler top), hue-rotated per activation,
    // modulated by the lensed picture so the image glows inside the wax.
    float hotness = clamp(1.2 - p.y + 0.35 * m, 0.0, 1.5);
    vec3 waxPal = mix(vec3(1.0, 0.62, 0.16), vec3(1.0, 0.25, 0.10), hotness * 0.7);
    waxPal = hueRot(waxPal, waxHueP + 0.25 * sin(audioBarPhase * 6.2831));
    vec3 wax = waxPal * (0.55 + 0.75 * pic);
    wax = mix(wax, wax * vec3(1.05, 0.75, 1.05), 0.30 * audioValence);
    wax *= 0.85 + 0.55 * audioLevel;

    // ---- Liquid + vessel -------------------------------------------------
    // Deep translucent liquid: cool gradient + a dim drifting image ghost.
    vec3 liquid = mix(vec3(0.10, 0.03, 0.16), vec3(0.02, 0.04, 0.14), uv.y)
                + img(uv) * 0.10;
    liquid = hueRot(liquid, 0.2 * sin(audioBarPhase * 6.2831));

    // Warm bulb glow rising from the base (breathes with the bass).
    float bulb = exp(-length(vec2(p.x * 0.7, p.y + 0.10)) * 3.2)
               * (0.8 + 0.5 * audioBass + 0.3 * audioSubBass);
    liquid += vec3(1.0, 0.45, 0.12) * bulb * 0.55;

    vec3 col = mix(liquid, wax, m);
    // The wax also catches the bulb light from below.
    col += vec3(1.0, 0.5, 0.15) * bulb * m * 0.35;

    // Blob rim light: a soft bright edge where the field crosses the surface.
    float rim = smoothstep(0.85, 1.05, field) * (1.0 - smoothstep(1.45, 1.9, field));
    col += waxPal * rim * (0.35 + 0.45 * audioBeat)
         * (1.0 + 0.25 * sin(field * 24.0 + time * 2.0) * audioCentroid);

    // Tapered glass vessel: soft side falloff + a glass rim highlight.
    float halfW = mix(0.46, 0.26, uv.y) * aspect * 0.62;
    float inside = smoothstep(halfW + 0.03, halfW - 0.02, abs(p.x));
    float glass  = smoothstep(halfW + 0.03, halfW, abs(p.x))
                 - smoothstep(halfW, halfW - 0.03, abs(p.x));
    col = col * mix(0.18, 1.0, inside)
        + vec3(0.9, 0.8, 0.7) * glass * (0.10 + 0.12 * audioLevel);

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
