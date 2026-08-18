#version 330 core
out vec4 fragColor;
// SolarWindMagnetosphere.frag

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

uniform float bowShockP;
uniform float auroraP;
uniform float speedP;
uniform float hueP;

in vec3 vNormal;
in vec2 vTexCoord;
in vec4 vColor;
in float vHeight;

/**
 * @file SolarWindMagnetosphere.frag
 * @brief Shades the magnetosphere bow-shock heightfield (built in
 * SolarWindMagnetosphere.vert) with a diffuse/specular lighting term, a
 * projected sample of the live slideshow photo, a wireframe magnetic-flux
 * grid, and additive auroral colour carried in vColor.
 *
 * audioLevel boosts the auroral colour; audioHigh brightens both the
 * flux-grid wireframe glow and the specular highlight; audioChromaHue (with
 * the hueP preset) rotates the final composite hue. Most of the other
 * declared audio uniforms (audioAdvance, audioKick, audioSubBass, audioBass,
 * audioMid, audioSwell, audioCentroid, audioValence, audioFlux, and the
 * bowShockP/auroraP/speedP presets) drive the heightfield's bow-shock
 * deformation and vertex colour in the vertex shader rather than here.
 */

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
    vec3 L = normalize(vec3(0.4, 0.8, 1.0));
    vec3 V = vec3(0.0, 0.0, 1.0);
    vec3 H = normalize(L + V);

    float diff = max(dot(N, L), 0.0);
    float spec = pow(max(dot(N, H), 0.0), 24.0);

    // Photo texture mapping onto magnetosphere heightfield
    vec3 photo = img(fract(vTexCoord * 2.0));

    // Magnetic flux wireframe grid lines
    vec2 gridLines = abs(fract(vTexCoord * 40.0) - 0.5);
    float gridWire = smoothstep(0.46, 0.49, max(gridLines.x, gridLines.y));

    // Auroral luminescence
    vec3 auroraCol = vColor.rgb * (1.2 + 0.8 * audioLevel);
    vec3 wireCol = vec3(0.2, 0.9, 1.0) * gridWire * (0.8 + 1.2 * audioHigh);

    vec3 col = (photo * 0.4 + auroraCol * 0.8) * (diff * 0.6 + 0.4) + wireCol;
    col += vec3(1.0, 0.95, 0.85) * spec * (0.8 + 1.5 * audioHigh);

    col = hueRot(col, audioChromaHue + hue);
    col = pow(col, vec3(0.9));

    fragColor = vec4(col, 1.0);
}
