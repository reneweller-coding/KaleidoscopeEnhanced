#version 330 core
out vec4 fragColor;

in vec3 vWorldPos;
in vec3 vNormal;
in float vVortexPhase;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;
uniform float audioChromaHue;

uniform float becP;
uniform float vortexP;
uniform float speedP;
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
    float hue = (hueP > 0.0) ? hueP : 0.0;

    // Circular Gaussian sprite profile
    vec2 pt = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(pt, pt);
    if (r2 > 1.0) discard;
    float glow = exp(-r2 * 3.5);

    // Photo texture mapping from world coords
    vec2 photoUV = fract(vWorldPos.xy * 0.25 + 0.5);
    vec3 photo = img(photoUV);

    // Ultra-cold rubidium condensate ruby & cyan palette
    vec3 becRuby = vec3(0.95, 0.1, 0.35);
    vec3 becCyan = vec3(0.1, 0.95, 1.0);
    vec3 tangleColor = mix(becCyan, becRuby, sin(vVortexPhase * 12.56 + audioPhase) * 0.5 + 0.5);

    vec3 col = mix(photo, tangleColor, 0.6) * glow;
    col += glow * vec3(1.0, 0.98, 0.92) * (1.0 + audioKick * 2.5);

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue);
    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, glow);
}
