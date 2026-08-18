#version 330 core
in vec3 vPos;
in vec2 vUV;
in float vStrandID;
in float vTranscription;

out vec4 fragColor;

/**
 * @file CyberspaceDNAHelix.frag
 * @brief Lighting for the double-helix DNA strand: colours each base-pair
 * rung by nucleotide (Adenine/Thymine/Cytosine/Guanine, cycled along the
 * strand) and flashes it toward white as a transcription pulse travels past.
 *
 * The transcription pulse itself (vTranscription, which drives both the
 * brightness boost and the colour mix toward the pulse colour) is generated
 * per-vertex in CyberspaceDNAHelix.vert, where audioKick sharpens it and
 * audioSwell widens the strand-unzipping fork at the helix's centre; this
 * fragment stage only reads vTranscription back and applies the preset hue
 * rotation (hueP).
 */

uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioSwell;

uniform float glowP;
uniform float helixP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float glw = (glowP > 0.0) ? glowP : 1.0;
    float hue = (hueP  > 0.0) ? hueP  : 0.0;

    float edge = smoothstep(0.5, 0.1, abs(vUV.y - 0.5));

    // DNA nucleotide base color mapping (Adenine=Green, Thymine=Red, Cytosine=Cyan, Guanine=Gold)
    float baseIdx = mod(floor(vUV.x * 40.0), 4.0);
    vec3 baseColor = vec3(0.0);
    if (baseIdx == 0.0) baseColor = vec3(0.1, 0.9, 0.3); // Adenine
    else if (baseIdx == 1.0) baseColor = vec3(1.0, 0.2, 0.3); // Thymine
    else if (baseIdx == 2.0) baseColor = vec3(0.1, 0.8, 1.0); // Cytosine
    else baseColor = vec3(1.0, 0.8, 0.2); // Guanine

    // Transcription laser pulse
    vec3 pulseColor = vec3(1.0, 1.0, 0.8);
    vec3 col = mix(baseColor, pulseColor, vTranscription * 0.7);
    col *= (0.8 + 2.0 * vTranscription) * edge * glw;

    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col * 1.7, edge * 0.95);
}
