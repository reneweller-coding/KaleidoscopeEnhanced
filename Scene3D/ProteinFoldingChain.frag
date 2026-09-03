#version 330 core
out vec4 fragColor;
/**
 * @file ProteinFoldingChain.frag
 * @brief Fragment stage for ProteinFoldingChain: the cytoplasm behind (the
 * photo soft and warm), residues as round shaded beads -- side chains
 * coloured by chroma class (index mod 12), the hydrophobic ones glowing
 * from within with the bass as the core forms -- bonds as pale tubes, the
 * kick a flash on the newest contacts, the treble a sparkle of water.
 *
 * Audio Reactivity: audioChroma[12] -> bead colour by class; audioBass ->
 *                   hydrophobic glow; audioKick -> contact flash; audioLevel.
 */
in vec2  vTexCoord;
in vec3  vWorld;
in float vKind;
in float vHydro;
in float vIdx;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float sceneProgress;
uniform float audioChroma[12];
uniform float audioKick;
uniform float audioBass;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioAdvance;
uniform float audioValence;
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

void main()
{
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float light = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col;
    if (vKind < -0.5)
    {
        vec2 uv = vTexCoord;
        vec3 soft = (interpolation * textureLod(tex0, uv, 4.0) + (1.0 - interpolation) * textureLod(tex1, uv, 4.0)).rgb;
        col = soft * imgPalette(hue * 0.159 + 0.55) * 0.6 * light + 0.02;
        col *= 0.5 + 0.7 * exp(-length(uv - 0.5) * 1.8);
        fragColor = vec4(col, 1.0);
        return;
    }
    int k = int(mod(vIdx, 12.0));
    float e = clamp(audioChroma[k] * 1.5, 0.0, 1.0);
    vec3 cc = imgPalette(hue * 0.159 + float(k) / 12.0) * 1.5 + 0.15;
    if (vKind > 0.5)
    {
        // Bond tube: pale, shaded across.
        float across = 1.0 - abs(vTexCoord.y - 0.5) * 2.0;
        col = vec3(0.8, 0.8, 0.85) * (0.4 + 0.6 * across) * light;
        fragColor = vec4(col, 1.0);
        return;
    }
    // Bead: round, shaded, class-coloured; hydrophobic ones glow with the
    // bass once the fold is compact.
    vec2 d = (vTexCoord - 0.5) * 2.0;
    float r = length(d);
    if (r > 1.0) discard;
    float sh = sqrt(1.0 - r * r);
    col = cc * (0.35 + 0.75 * sh) * light * (0.7 + 0.5 * e);
    col += vec3(1.0) * pow(max(1.0 - length(d - vec2(-0.35, 0.35)) * 1.6, 0.0), 3.0) * 0.5;
    float core = smoothstep(0.45, 0.85, clamp(sceneProgress, 0.0, 1.0));
    col += mix(vec3(1.0, 0.7, 0.3), cc, 0.4) * vHydro * core * (0.2 + 1.2 * clamp(audioBass, 0.0, 1.0)) * sh;
    col += cc * audioKick * 0.6 * vHydro * core;
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
