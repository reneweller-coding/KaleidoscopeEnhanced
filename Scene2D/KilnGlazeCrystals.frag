#version 330 core
out vec4 fragColor;
/**
 * @file KilnGlazeCrystals.frag
 * @brief KILN GLAZE CRYSTALS: a crystalline glaze -- zinc-silicate flowers
 * that grow in the glaze while the kiln holds its temperature.  A bowl
 * fills the frame; over the scene arc the crystals nucleate and grow as
 * radiating fans (each a fixed seed, its radius on the arc), each lit by
 * a chroma class; the glaze body is the photo, glossy; the kiln glow is
 * the bass, the kick a spark of the pyrometer, the treble the gloss.
 * Camera fixed above the bowl.
 *
 * Audio Reactivity:
 *   sceneProgress   -> crystal growth (the arc)
 *   audioChroma[12] -> crystal light by class (light)
 *   audioBass       -> kiln glow (light)
 *   audioHigh       -> gloss highlights (light)
 *   audioLevel      -> brightness
 *
 * Per-activation variety: seedsP, fanP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float sceneProgress;
uniform float audioAdvance;
uniform float audioChroma[12];
uniform float audioBass;
uniform float audioHigh;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float seedsP;
uniform float fanP;
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
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    int nSeeds = 8 + int(clamp(seedsP, 0.0, 1.0) * 10.0);
    float fanN = 8.0 + 10.0 * clamp(fanP, 0.0, 1.0);
    float prog = clamp(sceneProgress, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);

    // The bowl: a disc, its glaze the photo, glossy, with a rim; the kiln
    // interior (dark, red-glowing) around it.
    float r = length(p);
    float bowlR = 0.47;
    vec3 kiln = vec3(0.12, 0.05, 0.03) + vec3(0.9, 0.35, 0.1) * exp(-(r - bowlR) * 4.0) * (0.3 + 0.7 * bass) * step(bowlR, r);
    vec3 glaze = img(gl_FragCoord.xy / resolution) * 1.1;
    glaze = mix(glaze, glaze * imgPalette(hue * 0.159 + 0.5) * 1.5, 0.35);
    // The glaze pools thicker toward the centre (a deeper colour).
    glaze *= 0.85 + 0.15 * (1.0 - r / bowlR);
    vec3 col = mix(kiln, glaze, smoothstep(bowlR, bowlR - 0.01, r));

    // Crystals: radiating fans of needles from fixed seeds, growing on the
    // arc (each with its own nucleation time), each lit by a chroma class.
    for (int i = 0; i < 18; ++i)
    {
        if (i >= nSeeds) break;
        float fi = float(i);
        vec2 c = vec2(hash11(fi * 3.7) - 0.5, hash11(fi * 5.3) - 0.5) * bowlR * 1.6;
        if (length(c) > bowlR * 0.9) c *= 0.7;
        float nuc = hash11(fi * 7.7) * 0.5;                           // nucleation time in the arc
        float growth = smoothstep(nuc, nuc + 0.45, prog);
        float radius = (0.05 + 0.13 * hash11(fi * 9.1)) * growth;
        vec2 d = p - c;
        float dd = length(d);
        if (dd > radius + 0.02) continue;
        float ang = atan(d.y, d.x);
        // Needles: angular spokes with a slight curve, denser near the centre.
        float spokes = pow(0.5 + 0.5 * sin(ang * fanN + dd * 20.0 + hash11(fi * 2.2) * 6.28), 6.0);
        float body = smoothstep(radius, radius * 0.7, dd);
        float edge = smoothstep(radius + 0.01, radius - 0.005, dd);
        int k = int(mod(fi * 5.0, 12.0));
        float e = clamp(audioChroma[k] * 1.5, 0.0, 1.0);
        vec3 cc = mix(vec3(0.85, 0.9, 0.95), imgPalette(hue * 0.159 + float(k) / 12.0) * 1.6, 0.55);
        vec3 crystal = mix(glaze * 0.8, cc, 0.4 + 0.6 * spokes) * (0.7 + 0.6 * e);
        // A darker halo around each crystal (the glaze depleted), and a
        // bright rim on the growth front.
        col = mix(col, col * 0.75, smoothstep(radius + 0.03, radius, dd) * (1.0 - edge) * growth);
        col = mix(col, crystal, edge * growth);
        col += cc * smoothstep(0.006, 0.0, abs(dd - radius)) * growth * (0.3 + 0.5 * e);
    }
    // Gloss: highlights on the glaze surface, on the treble.
    col += vec3(1.0) * pow(max(1.0 - length(p - vec2(-0.15, 0.2)) * 3.0, 0.0), 4.0) * (0.15 + 0.5 * hi) * step(r, bowlR);
    col += vec3(1.0) * pow(max(1.0 - length(p - vec2(0.2, -0.1)) * 6.0, 0.0), 6.0) * (0.1 + 0.3 * hi) * step(r, bowlR);
    // The rim.
    col = mix(col, vec3(0.5, 0.4, 0.3) * (0.5 + 0.5 * bass), smoothstep(0.012, 0.0, abs(r - bowlR)));
    // Pyrometer spark on the kick.
    col += vec3(1.0, 0.6, 0.2) * exp(-length(p - vec2(aspect * 0.42, 0.4)) * 30.0) * (0.3 + 2.0 * audioKick);
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
