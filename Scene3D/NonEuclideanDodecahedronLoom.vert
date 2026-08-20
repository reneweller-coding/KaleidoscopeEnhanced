#version 330 core
/**
 * @file NonEuclideanDodecahedronLoom.vert
 * @brief Vertex stage companion to NonEuclideanDodecahedronLoom.frag -- see that file's header for
 * this scene's description.
 *
 * SCREEN FILL: all 20 strands used to weave the SAME small Lissajous knot at
 * the origin -- radius 1.5*dodecaP (as little as 0.75) seen from 6.5 units
 * away, i.e. 12..25% of the frame width, in an otherwise black picture
 * (occ 0.17, luma 0.011).  Each strand now has its own home: one of the 20
 * genuine dodecahedron vertex axes, so the loom is a SHELL of twenty woven
 * knots that spans the frame, each strand takes several non-retracing windings
 * instead of one, and the whole shell is stretched horizontally in view space
 * to match a 16:9 frame.
 */
layout(location = 0) in vec4 attrA;
layout(location = 1) in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

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

uniform float dodecaP;
uniform float loomP;
uniform float widthP;
uniform float hueP;

out vec3 vWorldPos;
out vec2 vTexCoord;
out float vRibbonIndex;

// The 20 vertices of a regular dodecahedron: the cube (+-1,+-1,+-1) plus the
// three cyclic rectangle families (0, +-1/phi, +-phi).  All lie on a sphere of
// radius sqrt(3), so one scale factor normalises the lot.
vec3 dodecaVertex(int i)
{
    const float PHI = 1.6180339887;
    const float IPH = 0.6180339887;
    if (i < 8)
        return vec3(float(i & 1) * 2.0 - 1.0,
                    float((i >> 1) & 1) * 2.0 - 1.0,
                    float((i >> 2) & 1) * 2.0 - 1.0);

    int   j   = i - 8;          // 0..11
    int   fam = j / 4;          // 0, 1, 2
    float a   = float(j & 1) * 2.0 - 1.0;
    float b   = float((j >> 1) & 1) * 2.0 - 1.0;
    if (fam == 0) return vec3(0.0,     a * IPH, b * PHI);
    if (fam == 1) return vec3(a * IPH, b * PHI, 0.0);
    return               vec3(a * PHI, 0.0,     b * IPH);
}

void main() {
    float ddc = (dodecaP > 0.0) ? dodecaP : 1.0;
    float lmp = (loomP   > 0.0) ? loomP   : 1.0;
    float wdp = (widthP  > 0.0) ? widthP  : 1.0;

    // dodecaP is still the size knob, but remapped into a band that always
    // fills the frame -- its old low end left the loom at 12% of frame width.
    float sz = 0.68 + 0.21 * ddc;          // 0.785 .. 1.10 over dodecaP 0.5..2.0

    // GEOM_RIBBON packs the ribbon index into attrA.w; attrB.x is a random
    // hash01 in [0,1), so int(attrB.x) was always 0 and all 20 ribbons
    // collapsed onto ribbon 0 (see Scene3DShader::buildGeometry).
    int ribbonIdx = int(attrA.w);
    float s = attrA.x;       // [0, 1] along ribbon
    float side = attrA.y;    // -1 or +1 for ribbon width
    vRibbonIndex = float(ribbonIdx) / 20.0;
    vTexCoord = vec2(s * 4.0, side * 0.5 + 0.5);

    float t = time * 0.4 + audioAdvance * 0.2;

    const float PHI = 1.6180339887; // Golden ratio

    // ONE KNOT PER DODECAHEDRON VERTEX: each strand weaves around its own axis
    // out on the shell, which is both what fills the frame and what finally
    // makes the scene literally dodecahedral.
    vec3 axis = dodecaVertex(ribbonIdx) * 0.57735027;   // / sqrt(3) -> unit
    vec3 upv  = (abs(axis.y) > 0.9) ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 e1   = normalize(cross(axis, upv));
    vec3 e2   = cross(axis, e1);

    // theta drifts along the strand, so the extra windings weave a shell
    // instead of retracing the same closed curve three times.
    float theta = float(ribbonIdx) * 0.314159265 + s * 2.4;
    float u = s * 6.2831853 * 3.0 * lmp + t * 0.5;

    float R  = 2.50 * sz;    // distance of the knot's centre from the origin
    float lr = 1.05 * sz;    // the knot's own radius

    // Hyperbolic dodecahedron geodesic curve, now in the knot's own frame.
    vec3 local = e1   * (sin(u * 2.0 + theta) * lr)
               + e2   * (cos(u * 3.0 + theta * PHI) * lr)
               + axis * (sin(u + theta * 2.0) * lr * 0.7);
    vec3 p0 = axis * R + local;

    // The tumble angles are needed BEFORE the ribbon is widened -- see below.
    float lyaw = time * 0.18 + audioAdvance * 0.07;
    float lcy = cos(lyaw), lsy = sin(lyaw);
    float lpit = 0.4 * sin(time * 0.13);
    float lpc = cos(lpit), lps = sin(lpit);

    // The camera's forward direction expressed in WORLD space, i.e. view-space
    // +z carried back through the inverse of the tumble applied below.
    vec3 fwd = vec3(0.0, 0.0, 1.0);
    fwd.yz = mat2(lpc, lps, -lps, lpc) * fwd.yz;     // undo pitch
    fwd.xz = mat2(lcy, lsy, -lsy, lcy) * fwd.xz;     // undo yaw

    // Tangent and binormal for ribbon width.
    // The binormal used to be cross(tangent, worldUp), which always comes out
    // with y == 0 -- i.e. it always lies in the xz plane. The camera looks along
    // z, so every strand whose tangent runs along x got a binormal pointing
    // straight down the view axis and was widened INTO THE SCREEN: those quads
    // rasterised edge-on to nothing at all. Same for any vertical strand, where
    // the (1,0,0) fallback gives (0,0,-1). A large share of 20 x 300 segments
    // was therefore never drawn, which is why a shell that spans the frame
    // measured occ 0.17 at luma 0.011. Crossing with the view direction instead
    // guarantees the ribbon is always presented flat to the lens.
    vec3 tangent = normalize(e1   * ( 2.0 * cos(u * 2.0 + theta))
                           + e2   * (-3.0 * sin(u * 3.0 + theta * PHI))
                           + axis * ( 0.7 * cos(u + theta * 2.0)));
    vec3 bn = cross(tangent, fwd);
    float bl = length(bn);
    // Degenerate only when the strand runs straight at the lens, where any
    // perpendicular is as good as another.
    vec3 binormal = (bl > 1e-4) ? bn / bl
                                : normalize(cross(tangent, vec3(1.0, 0.0, 0.0)));

    float ribbonWidth = (0.115 + 0.045 * sin(s * 15.0 + t * 3.0)) * wdp
                      * (1.0 + audioKick * 0.7);
    vec3 worldPos = p0 + binormal * (side * ribbonWidth);
    vWorldPos = worldPos;

    // Camera transform: projM expects NEGATIVE view-space z (clip-w = -z_view),
    // so push the scene away along +z and negate.  eyeOff is the stereo shift.
    // 3-axis tumble (user feedback: static view was dull)
    vec3 vp = worldPos;
    vp.xz = mat2(lcy, -lsy, lsy, lcy) * vp.xz;
    vp.yz = mat2(lpc, -lps, lps, lpc) * vp.yz;
    vp.z += 6.2;

    // A 16:9 frame is 1.78x wider than it is tall, so a spherical shell that
    // fills it vertically still leaves the sides bare.  The stretch is applied
    // in VIEW space, AFTER the tumble, so the wide axis can never rotate into
    // depth and let the margins go empty again.
    vp.x *= 1.35;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    // Anything that ends up behind the near plane would smear a wedge of
    // garbage across the frame; drop it instead.
    if (vp.z < 0.55)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
}
