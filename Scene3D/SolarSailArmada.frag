#version 330 core
out vec4 fragColor;

in vec3 vPos;
in vec3 vNormal;
in vec2 vUV;
in float vQuadID;
in float vGlint;

uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioChromaHue;
uniform float audioSwell;

uniform float glowP;
uniform float sailP;
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
    float sl  = (sailP > 0.0) ? sailP : 1.0;
    float hue = (hueP  > 0.0) ? hueP  : 0.0;

    // Sail frame border
    vec2 d = abs(vUV - vec2(0.5)) * 2.0;
    float border = max(d.x, d.y);
    float frame = smoothstep(0.85, 0.95, border);

    // Mylar / Gold foil reflectance
    vec3 goldFoil = vec3(1.0, 0.85, 0.45);
    vec3 titaniumFoil = vec3(0.85, 0.90, 0.98);
    vec3 sailBase = mix(goldFoil, titaniumFoil, step(1500.0, vQuadID));

    // Live kaleidoscope photo projection on reflective membrane
    vec2 photoUV = vUV * 0.8 + vec2(vQuadID * 0.001, sin(vQuadID));
    vec3 photoCol = img(fract(photoUV));

    // Specular solar flare glint
    vec3 glintColor = vec3(1.0, 1.0, 1.0) * vGlint * (2.0 + 3.0 * audioKick);

    // Structural carbon struts
    vec3 frameColor = vec3(0.12, 0.14, 0.18);
    vec3 surfaceColor = mix(sailBase * photoCol * 1.5, frameColor, frame);

    // Inter-sail laser communication mesh glow
    float laserBeam = exp(-abs(sin(vQuadID * 0.1 + time * 4.0)) * 12.0) * frame;
    vec3 laserCol = vec3(0.1, 0.8, 1.0) * laserBeam * (1.0 + 2.0 * audioKick);

    vec3 col = (surfaceColor + glintColor + laserCol) * glw * sl;

    col = hueRot(col, audioChromaHue + hue);
    fragColor = vec4(col, 1.0);
}
