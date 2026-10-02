#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file FluidInkMandala.frag
 * @brief FLUID INK MANDALA: the Navier-Stokes dye field (texFluid) laid
 * into concentric rings, each ring an n-fold mirror of a wedge of the ink
 * and each ring turning against its neighbours.  The ink is real fluid --
 * it curls, tears and mixes on its own -- and the mandala only orders it,
 * so the ornament is never the same twice.  Onsets send ripples out from
 * the centre through every ring; the stereo balance decides which side of
 * the dye field the rings draw from, so a panned part shifts the whole
 * mandala's source.
 *
 * Audio Reactivity:
 *   texFluid          -> the ink (audio-driven simulation)
 *   audioOnset        -> ripples outward (envelope on a continuous phase)
 *   audioStereoL / R  -> ring tint balance
 *   audioBeat         -> ring seams glow
 *   sceneAdvance      -> ring rotation, alternating, continuous
 *   audioKick         -> centre pulse
 *
 * Per-activation variety: ringsP (ring count), sidesP (fold count), hueP.
 */
uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform sampler2D texFluid;      ///< dye field of the Navier-Stokes sim, unit 8
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioOnset;   ///< Onset envelope (any instrument), 0..1.
uniform float audioStereoL;
uniform float audioStereoR;
uniform float audioBeat;   ///< Beat envelope, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

uniform float ringsP;
uniform float sidesP;
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief The house palette: a colour of the photo on an arc that turns with the music's hue.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float rings = floor((ringsP > 1.5 ? ringsP : 4.0) + 0.5);
    float n     = floor((sidesP > 1.5 ? sidesP : 8.0) + 0.5);
    float hue   = (hueP > 0.001) ? hueP : 0.0;

    float r = length(p);
    float a = atan(p.y, p.x);

    // Ring index and the position across the ring (spatial, allowed).
    float rk = r * rings * 1.15;
    float i  = floor(rk);
    float v  = fract(rk);
    // Alternating rotation, faster outward, all continuous.
    float dir = (mod(i, 2.0) < 0.5) ? 1.0 : -1.0;
    float rot = dir * sceneAdvance * (0.10 + 0.04 * i);

    // n-fold mirror inside the ring.
    float sector = 6.2831853 / n;
    float loc = mod(a + rot, sector);
    float mir = abs(loc - sector * 0.5);

    // A wedge of the dye field: radius runs with v, angle with the mirror;
    // the stereo balance slides the wedge's origin across the field.
    float eL = clamp(audioStereoL, 0.0, 1.5), eR = clamp(audioStereoR, 0.0, 1.5);
    vec2 src = vec2(0.5, 0.5);                 // fixed source (a per-frame shift is a shake, V7d)
    vec2 q = (0.12 + 0.36 * v) * vec2(cos(mir * 2.0), sin(mir * 2.0));
    vec2 suv = src + q;

    vec3 dye = texture(texFluid, suv).rgb;
    // Unsharp mask keeps the ink filaments crisp.
    vec2 px = 2.0 / resolution;
    vec3 blur = ( texture(texFluid, suv + vec2(px.x, 0.0)).rgb + texture(texFluid, suv - vec2(px.x, 0.0)).rgb
                + texture(texFluid, suv + vec2(0.0, px.y)).rgb + texture(texFluid, suv - vec2(0.0, px.y)).rgb ) * 0.25;
    dye += (dye - blur) * 1.2;

    // Fallback when the sim is dark: the photo through the same mandala.
    vec3 base = img(fract(suv)) * 0.3;
    vec3 col = max(dye * 2.2, base);
    col *= mix(vec3(1.0), imgPalette(hue * 0.159 + 0.1 * i + 0.05 * (eR - eL)), 0.5);

    // Ripples from the centre on the onset: a travelling phase, its
    // amplitude the envelope.
    float ripple = 0.5 + 0.5 * sin(r * 34.0 - sceneTime * 7.0 - sceneAdvance * 3.0);
    col *= 1.0 + 0.6 * clamp(audioOnset, 0.0, 1.0) * pow(ripple, 3.0);

    // Ring seams glow on the beat; the mirror seams faintly always.
    float seamR = exp(-min(v, 1.0 - v) * 40.0);
    float seamA = exp(-min(loc, sector - loc) * 60.0) * r;
    col += imgPalette(hue * 0.159 + 0.8) * (seamR * (0.15 + 0.5 * audioBeat) + seamA * 0.2);

    col *= 1.0 + 0.4 * audioKick * exp(-r * 4.0);
    col *= (0.7 + 0.5 * audioLevel) * (0.85 + 0.35 * audioSwell);
    col *= 1.0 - 0.4 * smoothstep(0.6, 1.1, r);

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
