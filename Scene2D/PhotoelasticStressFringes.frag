#version 330 core
out vec4 fragColor;
/**
 * @file PhotoelasticStressFringes.frag
 * @brief PHOTOELASTIC STRESS FRINGES: a transparent part between crossed
 * polarisers.  Where the material is stressed it turns the light, and the
 * difference of the principal stresses paints closed rainbow contours --
 * one full colour cycle per fringe order.  Two loads press on the part
 * and are driven by the swell (slow), so the fringe pattern breathes and
 * grows; the bass raises the fringe order (more rings), the treble is the
 * isoclinic dark brushes sharpening.  The whole part turns slowly on the
 * scene clock.  Camera fixed on the polariscope.
 *
 * Audio Reactivity:
 *   audioSwell -> load magnitude: how tightly the fringes crowd (slow)
 *   audioBass  -> fringe order (slow)
 *   audioHigh  -> the dark isoclinic brushes (light)
 *   sceneAdvance -> the part rotates steadily (continuous)
 *   audioLevel -> brightness
 *
 * Per-activation variety: loadsP, orderP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioBass;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float loadsP;
uniform float orderP;
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

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

// The interference colour for a retardation of n fringe orders between
// crossed polarisers.  A smooth walk through the Michel-Levy sequence,
// close enough for a stage and continuous everywhere.
vec3 fringeColour(float n)
{
    float a = n * 6.2831853;
    vec3 c = vec3(0.5 + 0.5 * cos(a),
                  0.5 + 0.5 * cos(a - 2.0944),
                  0.5 + 0.5 * cos(a - 4.1888));
    // Higher orders wash out toward white, as real fringes do.
    return mix(c, vec3(0.85), clamp((n - 1.5) * 0.16, 0.0, 0.55));
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float loads = 2.0 + floor(clamp(loadsP, 0.0, 1.0) * 3.0);           // once per activation
    float orderScale = 0.8 + 1.2 * clamp(orderP, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float spin = sceneAdvance * 0.06 + sceneTime * 0.012;

    // The part turns slowly; work in its own frame.
    float cs = cos(spin), sn = sin(spin);
    vec2 q = mat2(cs, -sn, sn, cs) * p;
    // The specimen: a rounded plate with a central hole and two notches --
    // the classic photoelastic demonstration piece.
    float plate = max(abs(q.x) - 0.44, abs(q.y) - 0.3);
    plate = min(plate, length(vec2(max(abs(q.x) - 0.44, 0.0), max(abs(q.y) - 0.3, 0.0))) - 0.06);
    float hole = 0.1 - length(q);
    float notchL = 0.07 - length(q - vec2(-0.44, 0.0));
    float notchR = 0.07 - length(q - vec2( 0.44, 0.0));
    float body = max(-plate, max(hole, max(notchL, notchR)));           // >0 inside the material
    float inside = smoothstep(-0.004, 0.004, body);

    // The stress field: each load is a point pressing on the rim; the
    // difference of principal stresses falls off with distance and
    // concentrates at the hole and the notches.
    float sigma = 0.0;
    for (int i = 0; i < 5; ++i)
    {
        if (float(i) >= loads) break;
        float fi = float(i);
        float a = 6.2831853 * (fi + 0.15) / loads;
        vec2 lp = vec2(cos(a) * 0.46, sin(a) * 0.33);
        float d = length(q - lp);
        // A load's own strength: fixed per activation, modulated slowly by
        // the swell so the pattern breathes instead of flickering.
        float strength = (0.5 + 0.5 * hash11(fi * 3.7)) * (0.35 + 0.9 * swell);
        sigma += strength / (0.05 + d * d * 6.0);
    }
    // Stress concentration around the hole (the classic rosette) and at
    // the notch roots.
    float rHole = max(length(q), 1e-3);
    sigma *= 1.0 + 0.9 / (1.0 + pow(rHole * 6.0, 3.0));
    sigma += 0.35 / (1.0 + pow(length(q - vec2(-0.44, 0.0)) * 9.0, 2.5));
    sigma += 0.35 / (1.0 + pow(length(q - vec2( 0.44, 0.0)) * 9.0, 2.5));
    // Fringe order: how many full wavelengths of retardation.
    float n = sigma * orderScale * (0.6 + 0.8 * bass);
    vec3 fringes = fringeColour(n);
    // Isochromatic brightness between crossed polarisers goes as sin^2.
    float bright = pow(abs(sin(n * 3.14159)), 0.7);
    // Isoclinics: the dark brushes where a principal axis lines up with the
    // polariser.  They follow the load directions, and the treble sharpens
    // them (contrast only, never position).
    float theta = atan(q.y, q.x) * 2.0 - spin * 2.0;
    float brush = 1.0 - 0.55 * pow(abs(cos(theta)), 3.0 + 6.0 * hi);
    vec3 mat = fringes * (0.35 + 0.85 * bright) * brush;
    // The photo lives inside the part, as the polariscope's diffuse source
    // seen through it -- faint, so the fringes stay the subject.
    mat = mix(mat, mat * (0.6 + 0.8 * img(clamp(q * 0.9 + 0.5, 0.0, 1.0))), 0.4);
    mat += imgPalette(hue * 0.159 + 0.5) * 0.08;

    // The field around the part: crossed polarisers pass nothing, so it is
    // nearly black with a little lamp scatter.
    vec3 dark = mix(vec3(0.02, 0.022, 0.03), imgPalette(hue * 0.159 + 0.6) * 0.06, 0.5);
    dark += vec3(0.05) * exp(-length(p) * 2.2) * (0.4 + 0.6 * swell);
    vec3 col = mix(dark, mat, inside);
    // The part's edge catches a rim of light, and the loading points show
    // as small bright anvils outside the rim.
    col += vec3(0.8, 0.85, 1.0) * smoothstep(0.006, 0.0, abs(body)) * 0.35;
    for (int i = 0; i < 5; ++i)
    {
        if (float(i) >= loads) break;
        float fi = float(i);
        float a = 6.2831853 * (fi + 0.15) / loads;
        vec2 lp = vec2(cos(a) * 0.46, sin(a) * 0.33);
        vec2 outward = normalize(lp);
        float d = length(q - (lp + outward * 0.035));
        col = mix(col, vec3(0.45, 0.46, 0.5), smoothstep(0.03, 0.022, d));
        col += vec3(0.9) * smoothstep(0.01, 0.0, length(q - lp)) * (0.2 + 0.5 * swell);
    }
    // The circular field stop of the polariscope.
    col *= smoothstep(0.62, 0.5, length(p * vec2(0.85, 1.0)));
    col *= 0.85 + 0.3 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
