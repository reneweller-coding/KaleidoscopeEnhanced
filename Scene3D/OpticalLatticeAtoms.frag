#version 330 core
out vec4 fragColor;
/**
 * @file OpticalLatticeAtoms.frag
 * @brief Fragment stage for OpticalLatticeAtoms: the vacuum chamber dark
 * with the photo faint on its far window, the lattice beams as faint red
 * lines, the atoms as round glowing discs whose colour is their chroma
 * class and whose brightness is that class's energy (the fluorescence
 * imaging), the magneto-optical-trap glow with the level, the treble a
 * sparkle on the beam crossings.
 *
 * Audio Reactivity: audioChroma[12] -> atom brightness by class;
 *                   audioLevel -> MOT glow; audioHigh -> sparkle; audioKick -> beam flash.
 */
in vec2  vTexCoord;
in vec3  vWorld;
in float vKind;
in float vPhase;
in float vClass;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float audioChroma[12];
uniform float audioKick;
uniform float audioHigh;
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
    vec3 col;
    if (vKind < -0.5)
    {
        vec2 uv = vTexCoord;
        col = img(uv) * imgPalette(hue * 0.159 + 0.6) * 0.12;
        col += vec3(0.4, 0.2, 0.25) * exp(-length(uv - 0.5) * 3.0) * 0.6 * (0.4 + 0.6 * audioLevel);   // the MOT glow
        fragColor = vec4(col, 1.0);
        return;
    }
    if (vKind > 1.5)
    {
        // Lattice beam: faint red, brighter on the kick.
        col = vec3(0.9, 0.15, 0.1) * (0.35 + 0.35 * audioKick);
        fragColor = vec4(col, 1.0);
        return;
    }
    // An atom: round glow, class colour, brightness from the class energy.
    vec2 d = (vTexCoord - 0.5) * 2.0;
    float r = length(d);
    if (r > 1.0) discard;
    int k = int(clamp(vClass, 0.0, 11.0));
    float e = clamp(audioChroma[k] * 1.5, 0.0, 1.0);
    vec3 ac = mix(imgPalette(hue * 0.159 + float(k) / 12.0) * 1.6, vec3(0.6, 0.8, 1.0), 0.3);
    float core = exp(-r * r * 4.0);
    float halo = (1.0 - r) * 0.5;
    col = ac * (core * (1.4 + 1.4 * e) + halo * (0.4 + 0.5 * e));
    col += vec3(1.0) * core * clamp(audioHigh * 2.0, 0.0, 1.0) * 0.4 * (0.5 + 0.5 * vPhase);
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
