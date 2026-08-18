#version 330 core
out vec4 fragColor;
// CombineTesseract4DRotation.frag
// -----------------------------------------------------------------------
// COMBINE TESSERACT 4D ROTATION: 4D hypercube rotation & W-axis slice transition.
// The image is embedded as a 3D hyperplane in 4D Euclidean space. Double
// rotations in XW and YZ planes rotate Universe 1 into the 4th dimension and
// project Universe 2 onto the 3D screen.
//   interpolation -> sweeps 4D hyper-rotation angle from 0 to pi/2
//   audioKick     -> flashes 4D tesseract edge boundary vertices
//   audioBass     -> undulates 4D hyper-volume projection perspective
//
// Per-activation variety:
//   rot4DP float 4D rotation angle velocity ratio (0.5..2.2)
//   sliceP float W-axis slicing plane displacement (0.5..2.0)
//   speedP float animation speed multiplier       (0.5..2.0)
//   hueP   float 4D wireframe hue offset          (0..6.28)
// -----------------------------------------------------------------------

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

uniform float rot4DP;
uniform float sliceP;
uniform float speedP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float r4d = (rot4DP > 0.0) ? rot4DP : 1.0;
    float slc = (sliceP > 0.0) ? sliceP : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.4 * spd + audioAdvance * 0.2;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // 4D point (x, y, z, w) where z = 0, w = 0 initially
    float angleXW = tProg * 1.5707963 * r4d; // 0 to 90 degrees
    float angleYZ = tProg * 1.5707963 * r4d + t * 0.5;

    // Rotate in X-W plane
    float xNew = p.x * cos(angleXW);
    float wNew = p.x * sin(angleXW);

    // Rotate in Y-Z plane
    float yNew = p.y * cos(angleYZ);
    float zNew = p.y * sin(angleYZ);

    // 4D perspective projection back to 2D: (x, y) / (2 - w)
    float d4D = max(1.8 - wNew * 0.5, 0.4);
    vec2 pProj = vec2(xNew, yNew) / d4D;

    vec2 warpUV = (pProj * resolution.y + 0.5 * resolution) / resolution;

    vec4 c1 = texture(tex1, fract(mix(uv, warpUV, midTransition)));
    vec4 c0 = texture(tex0, fract(mix(warpUV, uv, 1.0 - midTransition)));

    vec4 col = mix(c1, c0, tProg);

    // Tesseract 4D hypercube wireframe edge glow
    float wireEdge = max(abs(sin(p.x * 12.0 * slc)), abs(sin(p.y * 12.0 * slc)));
    float wireGlow = pow(wireEdge, 8.0) * midTransition;
    col.rgb += wireGlow * vec3(0.2, 0.9, 1.0) * (1.2 + audioKick * 3.0);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue);

    fragColor = col;
}
