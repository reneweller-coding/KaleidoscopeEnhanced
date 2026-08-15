#version 330 core
out vec4 fragColor;

in vec3 vPos;
in float vT;
in float vRibbonID;
in float vVelocity;
in float vSide;

uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioChromaHue;
uniform float audioSwell;

uniform float glowP;
uniform float trailP;
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
    float glw = (glowP  > 0.0) ? glowP  : 1.0;
    float trl = (trailP > 0.0) ? trailP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    // Edge falloff for glowing ribbon tube look
    float edge = 1.0 - abs(vSide);
    float coreGlow = pow(edge, 2.5);

    // Velocity Doppler color gradient
    vec3 slowCol = vec3(0.1, 0.4, 1.0);  // Cyan / blue
    vec3 fastCol = vec3(1.0, 0.1, 0.5);  // Magenta / hot pink
    vec3 neonCol = mix(slowCol, fastCol, clamp(vVelocity * 0.4 - 0.2, 0.0, 1.0));

    // High-speed pulse packets traveling along the ribbon
    float pulse = sin(vT * 40.0 - time * 15.0) * 0.5 + 0.5;
    pulse = pow(pulse, 6.0) * (1.0 + 2.0 * audioKick);

    // Photo texture modulation
    vec2 photoUV = vec2(vT * 2.0, vRibbonID / 20.0);
    vec3 photoCol = img(fract(photoUV));

    vec3 col = (neonCol * coreGlow * 1.8 + vec3(1.0) * pulse * 2.5 + photoCol * 0.4) * glw;
    col += vec3(0.2, 0.6, 1.0) * pow(edge, 8.0) * 1.5; // Bright center line

    col = hueRot(col, audioChromaHue + hue);
    fragColor = vec4(col, 1.0);
}
