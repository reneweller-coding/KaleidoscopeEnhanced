#version 430 core
layout(quads, fractional_odd_spacing, ccw) in;

in vec3 tcPos[];
in vec2 tcUV[];

uniform mat4 projM;
uniform float eyeOff;
uniform float time;
uniform float audioPhase;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioSwell;

out vec3 tePos;
out vec3 teNormal;
out vec2 teUV;
out float teCrystal;

float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
}

float voronoi(vec2 x) {
    vec2 n = floor(x);
    vec2 f = fract(x);
    float m = 8.0;
    for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 o = vec2(hash21(n + g), hash21(n + g + vec2(13.1, 7.3)));
            vec2 r = g + o - f;
            float d = dot(r, r);
            m = min(m, d);
        }
    }
    return sqrt(m);
}

void main() {
    float u = gl_TessCoord.x;
    float v = gl_TessCoord.y;

    vec2 uv = mix(mix(tcUV[0], tcUV[1], u), mix(tcUV[3], tcUV[2], u), v);

    // Tunnel / cavern cylindrical fold
    float angle = (uv.x - 0.5) * 4.2;
    float cavernRadius = 3.2 + 0.5 * sin(uv.y * 8.0 - time * 0.5);

    // Voronoi crystal cluster displacement
    float vCrystal = voronoi(uv * vec2(16.0, 32.0));
    float crystalHeight = (1.0 - vCrystal) * (0.8 + 0.6 * audioHigh);
    
    // Sharp faceted crystal spikes
    crystalHeight = pow(crystalHeight, 2.2) * 1.5;

    // Bass breathing of cavern walls
    float wallDisplace = (sin(uv.y * 12.0) * cos(uv.x * 10.0)) * 0.3 * (1.0 + 0.5 * audioBass);

    // Total displacement
    float r = cavernRadius - crystalHeight - wallDisplace;

    // 3D position in cavern
    vec3 pos = vec3(
        sin(angle) * r,
        cos(angle) * r - 1.0,
        (uv.y - 0.5) * 12.0
    );

    // Approximate faceted surface normal
    vec3 normal = normalize(vec3(-sin(angle), -cos(angle), 0.0) + vec3(sin(crystalHeight * 20.0) * 0.4, cos(crystalHeight * 20.0) * 0.4, 0.2));

    tePos = pos;
    teNormal = normal;
    teUV = uv;
    teCrystal = crystalHeight;

    // Stereoscopic 3D camera projection
    vec3 vp = pos;
    vp.z += 6.5;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
