#version 330 core
out vec4 fragColor;

in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vTexCoord;
in float vDoppler;

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

uniform float toroidP;
uniform float iscoP;
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

    // Photo texture mapping onto accretion grid
    vec3 photo = img(vTexCoord);

    // Relativistic Doppler beaming palette (approaching = intense cyan-white, receding = deep ruby redshift)
    vec3 blueShift = vec3(0.3, 0.9, 1.0) * 1.5;
    vec3 redShift  = vec3(0.9, 0.15, 0.05) * 0.6;
    vec3 dopplerColor = mix(redShift, blueShift, vDoppler * 0.5 + 0.5);

    // Accretion disk incandescent glow — a rim around the ISCO edge, not a
    // frame-filling flood (old gain washed everything white).
    float r = length(vWorldPos.xz);
    float innerGlow = exp(-abs(r - 1.1) * 2.2) * (0.7 + audioKick * 0.7 + audioHigh * 0.4);

    // Lighting
    vec3 lightDir = normalize(vec3(0.0, 1.0, 0.0));
    float diff = max(dot(vNormal, lightDir), 0.0);

    vec3 col = mix(photo, dopplerColor, 0.55);
    col = col * (0.4 + 0.6 * diff) + innerGlow * vec3(1.0, 0.95, 0.7) * 1.1;

    if (hue > 0.001) col = hueRot(col, hue);

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (col) * 0.55;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
