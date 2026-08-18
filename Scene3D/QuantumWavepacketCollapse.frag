#version 330 core
in vec3 vPos;
in float vProb;
in float vPhase;

out vec4 fragColor;

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
uniform float collapseP;
uniform float hueP;


uniform float audioChromaHue;
uniform float audioValence;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}


// IMG-PALETTE (house standard): colours come from a rotating arc in the
// CURRENT slideshow image, so every activation inherits a fresh palette from
// the photos; the arc follows the musical key (audioChromaHue is circular-
// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

void main() {
    float glw = (glowP > 0.0) ? glowP : 1.0;
    float hue = (hueP  > 0.0) ? hueP  : 0.0;

    vec2 circ = gl_PointCoord - vec2(0.5);
    float r = length(circ);
    if (r > 0.5) discard;

    float alpha = smoothstep(0.5, 0.10, r);

    // Quantum phase chromatic mapping (complex phase angle to color).
    // Saturation is pushed past the house default because thousands of these
    // sprites accumulate additively — anything pale piles up to plain white.
    vec3 phaseColor = imgPalette((vPhase + audioPhase) * 0.159);
    phaseColor = mix(vec3(dot(phaseColor, vec3(0.333))), phaseColor, 1.5);

    // Probability density intensity modulation (kick gain kept moderate for
    // the same reason: the old *2.5 burned the whole cloud to white).
    vec3 col = phaseColor * (0.30 + 0.55 * vProb) * (1.0 + audioKick * 1.1) * glw;

    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, alpha);
}
