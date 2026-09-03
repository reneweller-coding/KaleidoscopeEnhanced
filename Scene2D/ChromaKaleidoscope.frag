#version 330 core
out vec4 fragColor;
/**
 * @file ChromaKaleidoscope.frag
 * @brief CHROMA KALEIDOSCOPE: twelve mirror segments, one per pitch class.
 * The chroma vector decides how brightly each segment burns, so a chord is a
 * pattern of lit wedges and a key change rotates that pattern around the
 * ring; the melody note breathes a soft halo over its own wedge.  In fifths
 * mode the wedges are ordered by the circle of fifths, so harmonic
 * neighbours sit side by side and a diatonic chord lights a contiguous arc.
 * Harmony becomes geometry -- and the fold count is fixed at twelve, so the
 * mirror itself never jumps.
 *
 * Audio Reactivity:
 *   audioChroma[12]  -> wedge brightness (the whole point)
 *   audioMelodyPitch -> soft halo over the melody's wedge (glides)
 *   audioKick        -> the ring pulses inward
 *   audioBeat        -> wedge brightness (light only, V7d)
 *   sceneAdvance     -> ring rotation and the endless photo zoom
 *
 * Per-activation variety: fifthsP (chromatic or fifths order), zoomP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioChroma[12];
uniform float audioMelodyPitch;
uniform float audioKick;
uniform float audioBeat;
uniform float audioLevel;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioValence;

uniform float fifthsP;
uniform float zoomP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

// Circular distance between two positions on a 12-ring.
float ringDist(float a, float b)
{
    float d = abs(a - b);
    return min(d, 12.0 - d);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    bool fifths = fifthsP > 0.5;
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float zoom = (zoomP > 0.05 ? zoomP : 1.0);

    float r = length(p);
    float a = atan(p.y, p.x) + sceneAdvance * 0.12;
    const float sector = 6.2831853 / 12.0;
    float ang  = mod(a, 6.2831853);
    float k    = floor(ang / sector);             // wedge index (spatial)
    float loc  = mod(ang, sector);
    float mir  = abs(loc - sector * 0.5);         // mirrored inside the wedge

    // Which pitch class this wedge shows.
    float pc = fifths ? mod(k * 7.0, 12.0) : k;
    // Normalise by the loudest class so the chord always burns at full
    // brightness whatever the absolute chroma level.
    float maxc = 1e-3;
    for (int i = 0; i < 12; ++i) maxc = max(maxc, audioChroma[i]);
    float e  = clamp(audioChroma[int(pc)] / maxc, 0.0, 1.0);

    // The melody's halo: a smooth kernel over ring distance, so the halo
    // crossfades between wedges as the pitch glides.
    float mp = clamp(audioMelodyPitch, 0.0, 0.9999) * 12.0;
    float mpos = fifths ? mod(mp * 7.0, 12.0) : mp;      // where that class sits on the ring
    float halo = exp(-pow(ringDist(mpos, k + 0.5), 2.0) * 1.6);

    // Photo folded into the wedge, sampled in log-polar so the zoom is
    // endless.
    vec2 q = r * vec2(cos(mir), sin(mir)) * zoom;
    float lr = log(length(q) + 0.3) * 0.9 + sceneAdvance * 0.06;
    float an = atan(q.y, q.x) * 0.15915494;
    vec2 uv = vec2(fract(an * 2.0 + lr * 0.3), fract(lr * 0.6));
    vec3 tex = img(uv);

    // Wedge tint from the palette, keyed by the pitch class so the same note
    // is always the same colour family.
    vec3 tint = imgPalette(hue * 0.159 + pc / 12.0);
    float bright = (0.3 + 1.1 * e * e + 0.5 * halo) * (1.0 + 0.2 * audioBeat);
    vec3 col = mix(tex, tex * tint * 1.8, 0.6) * bright * (0.9 + 0.4 * audioLevel);

    // Wedge seams; the kick pulses a ring inward.
    float seam = exp(-min(loc, sector - loc) * 50.0) * 0.25;
    col += imgPalette(hue * 0.159 + 0.85) * seam * (0.5 + e);
    float ringR = 0.55 - 0.3 * audioKick;
    col += tint * exp(-abs(r - ringR) * 20.0) * 0.5 * audioKick;
    // The ring itself, dark centre so the wedges read.
    col *= smoothstep(0.02, 0.12, r);
    col *= 0.85 + 0.35 * audioSwell;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
