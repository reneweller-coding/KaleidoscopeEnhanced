#version 330 core
in vec3 vPos;
in vec2 vUV;
in float vTier;
in float vReadLaser;

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
uniform float laserP;
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
    float lsr = (laserP > 0.0) ? laserP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    // Hexagonal crystal wafer boundary
    vec2 p = abs(vUV - vec2(0.5));
    float hexDist = max(p.x * 0.866025 + p.y * 0.5, p.y);
    if (hexDist > 0.48) discard;

    // Crystal edge rim glow
    float edge = smoothstep(0.42, 0.48, hexDist);

    // Stored holographic photo imagery
    vec3 photo = img(vUV);

    // Optical data track scan lines
    float tracks = 0.5 + 0.5 * sin(vUV.y * 80.0 + time * 10.0);
    photo *= (0.7 + 0.3 * tracks);

    // Holographic quartz crystal iridescence
    vec3 irid = 0.5 + 0.5 * cos(vec3(0.0, 1.8, 3.6) + vTier * 6.28 + vUV.x * 4.0);

    // Laser read pulse illumination
    vec3 laserCol = vec3(0.0, 1.0, 0.8) * vReadLaser * lsr * (1.0 + audioKick * 3.0);

    // Combine wafer appearance
    vec3 col = mix(photo, irid, 0.35) * (0.8 + 0.4 * audioSwell);
    col += irid * edge * 2.0;
    col += laserCol;

    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col * glw, 0.9);
}
