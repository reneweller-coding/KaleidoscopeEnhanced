#version 330 core
out vec4 fragColor;
/**
 * @file SelfSimilarityMandala.frag
 * @brief SELF-SIMILARITY MANDALA: the song's memory of itself as a mandala.
 * The self-similarity matrix (texSSM) holds how much every moment of the
 * last stretch resembles every other.  Here the row "now against the past"
 * is wrapped into rings -- the centre is now, each ring further out a
 * moment further back -- and folded n-way into a mandala, so a returning
 * chorus lights whole rings at once and a new section darkens them.  A
 * second layer draws the full matrix's diagonal bands as petals.  The
 * mandala turns on the scene clock; everything else is light.
 *
 * Audio Reactivity:
 *   texSSM        -> the whole picture (the point)
 *   audioSectionKnown -> a returning section warms the mandala (light)
 *   sceneAdvance  -> rotation (continuous)
 *   audioKick     -> the centre flashes (light)
 *   audioLevel    -> brightness
 *
 * Per-activation variety: sidesP (fold count), spanP (how much history), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform sampler2D texSSM;        // self-similarity matrix ring, unit 10
uniform float ssmHead;
uniform float ssmFill;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSectionKnown;
uniform float audioKick;
uniform float audioLevel;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioValence;

uniform float sidesP;
uniform float spanP;
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

// Similarity between the moment `a` ago and the moment `b` ago (0 = now).
float ssm(float a, float b)
{
    return texture(texSSM, vec2(ssmHead - a, ssmHead - b)).r;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float n   = floor((sidesP > 1.5 ? sidesP : 8.0) + 0.5);
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float span = (0.3 + 0.6 * clamp(spanP, 0.0, 1.0)) * max(ssmFill, 0.05);

    float r = length(p);
    float a = atan(p.y, p.x) + sceneAdvance * 0.08;
    float sector = 6.2831853 / n;
    float loc = mod(a, sector);
    float mir = abs(loc - sector * 0.5) / (sector * 0.5);   // 0..1 across the wedge

    // Ring layer: now against the past, radius = age.
    float age = clamp(r / 0.9, 0.0, 1.0) * span;
    float simNow = ssm(0.0, age);
    // Petal layer: similarity between two past moments picked by the wedge
    // position -- the matrix's diagonal bands become petals.
    float ageB = clamp(mir, 0.0, 1.0) * span;
    float simPair = ssm(age, ageB);

    vec3 ringCol = imgPalette(hue * 0.159 + 0.15 + 0.5 * age / max(span, 1e-3));
    vec3 petalCol = imgPalette(hue * 0.159 + 0.6);
    float ring = pow(clamp(simNow, 0.0, 1.0), 2.0);
    float petal = pow(clamp(simPair, 0.0, 1.0), 3.0);
    // Ring stripes so the ages read as rings.
    float stripes = 0.6 + 0.4 * pow(0.5 + 0.5 * cos(age * 90.0), 2.0);
    vec3 col = ringCol * ring * stripes * 2.0 + petalCol * petal * 1.3;
    // A returning section warms everything (we have been here before).
    col = mix(col, col * imgPalette(hue * 0.159 + 0.05) * 2.0, 0.4 * clamp(audioSectionKnown, 0.0, 1.0));
    // Seams and the centre.
    float seam = exp(-min(loc, sector - loc) * 45.0) * 0.2;
    col += imgPalette(hue * 0.159 + 0.9) * seam;
    col += imgPalette(hue * 0.159 + 0.95) * exp(-r * 12.0) * (0.4 + 1.5 * audioKick);
    col += imgPalette(hue * 0.159 + 0.4) * 0.03;                     // never black
    col *= (0.7 + 0.5 * audioLevel) * (0.85 + 0.35 * audioSwell);
    col *= 1.0 - 0.5 * smoothstep(0.85, 1.15, r);

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
