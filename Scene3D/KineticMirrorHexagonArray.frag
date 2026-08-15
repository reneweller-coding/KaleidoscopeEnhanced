#version 330 core
out vec4 fragColor;
// KineticMirrorHexagonArray.frag

uniform vec2  resolution;
uniform float time;
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

uniform float hueP;

in vec3 vNormal;
in vec2 vTexCoord;
in vec4 vColor;

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

    vec3 N = normalize(vNormal);
    vec3 V = vec3(0.0, 0.0, 1.0);
    vec3 R = reflect(-V, N);

    // Reflected photo texture
    vec2 refUV = R.xy * 0.5 + vec2(0.5);
    vec3 photoRef = img(fract(refUV));

    // Specular sunlight flash
    vec3 L = normalize(vec3(0.5, 0.8, 1.0));
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 32.0);

    // Hexagonal mirror border
    vec2 b = abs(vTexCoord - vec2(0.5)) * 2.0;
    float border = max(b.x, b.y);
    float edgeMask = smoothstep(0.85, 0.95, border);

    vec3 col = photoRef * (0.8 + 0.4 * audioLevel) * (1.0 - edgeMask * 0.5);
    col += vColor.rgb * edgeMask * (1.2 + 1.5 * audioHigh);
    col += vec3(1.0, 0.98, 0.9) * spec * (1.5 + 2.0 * audioKick);

    col = hueRot(col, audioChromaHue + hue);
    col = pow(col, vec3(0.9));

    fragColor = vec4(col, 1.0);
}
