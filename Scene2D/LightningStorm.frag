#version 330 core
out vec4 fragColor;
/**
 * @file LightningStorm.frag
 * @brief Displays the branching electrical discharge simulated in Engine/CfxLightningStep, built around the fact that a real bolt reads mostly as afterglow rather than as the thin flash itself.
 *
 * The simulation grows exactly ONE tree of leaders per strike, from one point on the top edge, so on its own it hangs in a single narrow column of the picture. This pass re-projects that tree through three different UV frames — the original, a mirrored one and a shifted, shorter one — so a strike lights the frame the way a real storm front does, with sibling discharges going off across the sky. Behind them a roiling cloud ceiling is lit by the same flash, which is what turns the space between the bolts into weather instead of dead black.
 *
 * texLightning is bloomed at two scales per instance, a tight halo for the filament and a very wide one for the sheet-lightning glow, and that far halo's brightness gates how much of the photo is briefly revealed, cold and desaturated, as if lit by the storm. audioLevel, audioKick, audioBeat and audioChromaHue are declared but not read by this pass itself, since the bolt's own timing and shape are already driven by audio inside the CfxLightningStep compute simulation.
 *
 * Audio Reactivity:
 *  - audioDrop      -> punches up the overall exposure on a drop
 *  - audioSnare     -> THUNDER FLASH: snares and claps deepen how far the sheet
 *                      glow reveals the photo, so every backbeat lights the
 *                      landscape up under the storm
 *  - audioSharpness -> FILAMENT vs SHEET: bright, incisive material puts the energy
 *                      into the tight halo (a crisp, hard bolt), dull material moves
 *                      it into the wide halo (diffuse sheet lightning). An energy
 *                      trade between two existing terms, so exposure stays put
 *  - audioZCR       -> CRACKLE: broadband noisiness scatters the halo ring taps per
 *                      pixel, fraying the corona into a noisy, crackling discharge
 *                      instead of a clean glow
 */
// LightningStorm.frag — the branching discharge from Engine/CfxLightningStep.
// A bolt is mostly AFTERGLOW: the visible event is short, the bloom and the
// lit-up surroundings are what the eye actually reads, so most of the work
// here is a wide halo and using the bolt's own brightness to light the photo.

uniform sampler2D tex0;
uniform sampler2D texLightning;   // <- requests the discharge sim
uniform vec2  resolution;
uniform float time;
uniform float interpolation;

uniform float audioLevel;
uniform float audioKick;
uniform float audioBeat;
uniform float audioDrop;
uniform float audioChromaHue;
uniform float audioSnare;       // snare/clap onset envelope -> thunder-flash reveal
uniform float audioSharpness;   // 0=dull .. 1=sharp/harsh -> filament vs sheet glow
uniform float audioZCR;         // 0=pure tone .. 1=broadband noise -> corona crackle

uniform float glowP;
uniform float skyP;               // how much of the photo the flash reveals

// One instance of the discharge: the raw filament plus its two halo scales.
// Every tap is wrapped with fract(), so a sibling frame that runs off the edge
// of the canvas re-enters on the other side instead of smearing the border
// texel across half the sky.
void gather(vec2 p, float jit, float zcr, float r1, float r2,
            out vec3 bolt, out vec3 nearH, out vec3 farH)
{
    bolt  = texture(texLightning, fract(p)).rgb;
    nearH = vec3(0.0);
    farH  = vec3(0.0);
    for (int i = 0; i < 8; ++i)
    {
        float a = float(i) * 0.7853982 + (jit - 0.5) * zcr * 1.2;
        vec2  d = vec2(cos(a), sin(a));
        nearH += texture(texLightning, fract(p + d * r1)).rgb;
        farH  += texture(texLightning, fract(p + d * r2)).rgb;
    }
    nearH *= 0.125;
    farH  *= 0.125;
}

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float vnoise(vec2 p)
{
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i),                  b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p)
{
    float s = 0.0, a = 0.55;
    for (int i = 0; i < 4; ++i) { s += a * vnoise(p); p = p * 2.07 + 7.3; a *= 0.5; }
    return s;
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;

    // Two halo scales: a tight one for the filament, a very wide one for the
    // sheet-lightning glow that fills the sky.
    // Broadband noisiness FRAYS the corona: the ring taps get a per-pixel
    // angular scatter, so a harsh, noisy mix reads as a crackling discharge
    // while a pure tone keeps the halo clean and smooth.
    float zcr = clamp(audioZCR, 0.0, 1.0);
    float jit = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);

    float r1 = 0.005 + 0.006 * glowP;
    float r2 = 0.055 + 0.070 * glowP;

    // THREE STRIKES from one simulated tree.  The sim seeds a single leader at
    // one x on the top edge, so undiluted it is a bolt in one corner of an
    // otherwise empty frame; re-reading it through a mirrored and a shifted,
    // vertically shortened frame spreads the storm front across the sky.  The
    // siblings are weaker and differently proportioned, so it reads as several
    // discharges rather than as a wallpaper repeat.
    vec3 b0, n0, f0, b1, n1, f1, b2, n2, f2;
    gather(uv,                                          jit, zcr, r1, r2, b0, n0, f0);
    gather(vec2(1.0 - uv.x + 0.37, uv.y * 0.94 + 0.06), jit, zcr, r1, r2, b1, n1, f1);
    gather(vec2(uv.x + 0.63,       uv.y * 0.82 + 0.18), jit, zcr, r1, r2, b2, n2, f2);

    vec3 bolt = b0 + b1 * 0.62 + b2 * 0.45;
    vec3 near = n0 + n1 * 0.62 + n2 * 0.45;
    vec3 far  = f0 + f1 * 0.70 + f2 * 0.55;

    float flash = clamp(dot(far, vec3(0.4)), 0.0, 1.5);

    // Zwicker sharpness decides where the bolt's energy sits: bright, incisive
    // material concentrates it in the tight filament halo, a dull rumble pushes
    // it out into the wide sheet glow.  A TRADE between the two existing terms
    // -- the summed weight stays essentially constant, so exposure does not move.
    float sh = clamp(audioSharpness, 0.0, 1.0);
    vec3 col = bolt * 1.5
             + near * (0.9 * (0.70 + 0.60 * sh))
             + far  * ((0.55 + 0.5 * glowP) * (1.24 - 0.48 * sh));

    // THE CLOUD CEILING.  A storm is not a black room with a spark in it: the
    // sky between the strikes is a low, roiling deck that the discharge lights
    // from within.  It is dark and cold on its own and only really appears when
    // a bolt fires, so the scene keeps its weather -- but it is never nothing.
    // The drift coefficients are constants on `time`; no audio value touches
    // them, so the ceiling can never stutter.
    vec2  cp = uv * vec2(6.0, 3.5) + vec2(time * 0.013, -time * 0.005);
    float cl = clamp(fbm(cp) * 0.85 + fbm(cp * 2.3 + 4.1) * 0.35, 0.0, 1.0);
    cl *= 0.35 + 0.65 * smoothstep(0.02, 0.62, uv.y);      // heaviest overhead
    vec3 storm = vec3(0.28, 0.34, 0.50) * cl
               * (0.55 + min(1.10 * flash, 1.20));
    col += min(storm, vec3(0.62));

    // The storm lights the scene: the photo is dark until a bolt fires, then
    // it is briefly revealed, cold and desaturated like real lightning.
    vec3 photo = texture(tex0, uv).rgb;
    float lum = dot(photo, vec3(0.299, 0.587, 0.114));
    vec3 lit = mix(vec3(lum), photo, 0.5) * vec3(0.80, 0.88, 1.10);
    // Basis-Anteil erneut angehoben (war 0.045, dann 0.16): mit 16% Fotolicht
    // blieb alles ausserhalb des einen Blitzbaums praktisch schwarz, das Bild
    // war zu drei Vierteln tot.  Jetzt liegt immer ein gedaempftes,
    // gewitterstimmiges Foto unter der Wolkendecke, die Blitze setzen die
    // Akzente obendrauf.
    // Snares and claps are the thunder: they deepen how far the sheet glow
    // reveals the landscape.  Still GATED by 'flash', so a snare on its own
    // never lights an empty sky -- and bounded, so the reveal cannot run away.
    float reveal = (0.35 + 0.5 * skyP) * flash
                 * (1.0 + min(0.65 * clamp(audioSnare, 0.0, 1.0), 0.65));
    col += lit * (0.38 + min(reveal, 1.30));

    col *= 1.0 + 0.5 * audioDrop;
    col = col / (1.0 + col * 0.38);
    fragColor = vec4(col, interpolation);
}
