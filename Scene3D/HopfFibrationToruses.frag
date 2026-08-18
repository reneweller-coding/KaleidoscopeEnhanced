#version 330 core
in vec3 vPos;
in vec2 vUV;
in float vFiberID;
in float vEnergy;

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
uniform float widthP;
uniform float hueP;


uniform float audioChromaHue;
uniform float audioValence;

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

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float glw = (glowP  > 0.0) ? glowP  : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    // Edge fading along ribbon cross-section
    float crossEdge = smoothstep(0.5, 0.1, abs(vUV.y - 0.5));

    // Hopf fiber chromatic spectrum
    vec3 fiberColor = imgPalette(vFiberID + audioPhase * 0.159);

    // Light pulses traveling along Villarceau circle fibers
    float speedPulse = 0.5 + 0.5 * sin(vUV.x * 30.0 - time * 10.0);
    fiberColor = mix(fiberColor, vec3(1.0, 0.9, 0.7), speedPulse * 0.6);

    vec3 col = fiberColor * vEnergy * crossEdge * glw;

    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, crossEdge * 0.9);
}
