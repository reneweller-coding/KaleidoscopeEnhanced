#version 430 core
/**
 * @file CrystallineCavernTessellation.tese
 * @brief Tessellation-evaluation stage companion to CrystallineCavernTessellation.frag -- see that file's header for
 * this scene's description.
 */
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

// Periodic in x over `px` cells.  The cavern is a CLOSED tube now, so uv.x = 0
// and uv.x = 1 are the SAME generator; seeding the cells from an unwrapped
// index put a different crystal field on either side of that seam and opened a
// crack running the full length of the tunnel (measured step in the wall
// radius: 0.46 mean, 1.39 peak, on a tube of radius 3.2).  Wrapping the CELL
// INDEX -- and not the sample point -- makes the field tile while leaving every
// distance in the cell exact, so the crystals look identical, minus the crack.
float voronoi(vec2 x, float px) {
    vec2 n = floor(x);
    vec2 f = fract(x);
    float m = 8.0;
    for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 c = n + g;
            c.x = mod(c.x, px);
            vec2 o = vec2(hash21(c), hash21(c + vec2(13.1, 7.3)));
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

    // Tunnel / cavern cylindrical fold.
    // 4.2 rad is only 240 degrees: the cavern was an open trough that left a
    // wedge of the frame empty on either side (measured occ 0.36). A full turn
    // closes the tube around the camera, and the two ends of the uv range land
    // on the same generator so the seam is a line, not a gap.
    float angle = (uv.x - 0.5) * 6.2831853;
    float cavernRadius = 3.2 + 0.5 * sin(uv.y * 8.0 - time * 0.5);

    // Voronoi crystal cluster displacement, 16 cells around the tube so the
    // field tiles across the closed seam (see voronoi() above).
    float vCrystal = voronoi(uv * vec2(16.0, 32.0), 16.0);
    // max(..., 0.0) is load-bearing: this voronoi reaches 1.13, so 1.0 -
    // vCrystal goes NEGATIVE on part of the surface, and pow(x, 2.2) with x < 0
    // is UNDEFINED in GLSL -- in practice NaN, which propagates through r into
    // gl_Position and throws the whole patch off screen.
    float crystalHeight = max(1.0 - vCrystal, 0.0) * (0.8 + 0.6 * audioHigh);

    // Sharp faceted crystal spikes
    crystalHeight = pow(crystalHeight, 2.2) * 1.5;

    // Bass breathing of cavern walls.  TWO whole turns around the tube rather
    // than 10 radians: an integer number of periods is what keeps this
    // continuous across the closed seam -- cos(10) = -0.84 against cos(0) = 1
    // was a 0.55 step in the wall radius on its own.
    float wallDisplace = (sin(uv.y * 12.0) * cos(uv.x * 12.5663706))
                       * 0.3 * (1.0 + 0.5 * audioBass);

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
