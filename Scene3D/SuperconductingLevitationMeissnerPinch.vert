#version 330 core
/**
 * @file SuperconductingLevitationMeissnerPinch.vert
 * @brief Vertex stage companion to SuperconductingLevitationMeissnerPinch.frag -- see that file's
 * header for this scene's description.
 *
 * SCREEN FILL: one levitation assembly, 1.15 units of disc radius seen from
 * 4.5 units away, covered barely a third of the frame width and left the rest
 * black (occ 0.17).  The 220 x 120 patch is now split into a 4 x 2 array of
 * EIGHT independent assemblies -- GEOM_GRID emits each cell as its own pair of
 * triangles, so a split taken from the CELL INDEX (never from the continuous
 * uv) cannot stretch a triangle between two blocks -- and each assembly's
 * profile has gained a wide cryostat cold plate whose rim overlaps its
 * neighbours', so the array reads as one continuous cold bed rather than eight
 * islands.
 */

in vec4 attrA; // xy = Patch UV [0,1], z = 0, w = Patch index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out vec3 vNormal;
out vec3 vCol;
out float vMeissnerGlow;

uniform mat4 projM;
uniform float eyeOff;
uniform float time;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioChromaHue;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float diskScaleP;
uniform float levitateDistP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

// Profile of the surface of revolution, as (radius, height) against p in [0,1]:
//   p 0.00 .. 0.20   the cryostat cold plate: a shallow bowl from its wide
//                    outer rim inward to the YBCO disc's edge
//   p 0.20 .. 0.52   the YBCO disc, rim inward to its centre (slightly domed)
//   p 0.52 .. 0.60   the pinched flux column bridging the levitation gap
//   p 0.60 .. 1.00   the levitating magnet, centre outward and over its dome
// One connected profile, so the patch grid never has to stretch triangles
// between two disjoint pieces.
vec2 mpProfile(float p, float levGap)
{
    float magPart   = smoothstep(0.545, 0.72, p);
    float platePart = 1.0 - smoothstep(0.16, 0.24, p);

    float qp = clamp(p / 0.20, 0.0, 1.0);           // plate rim -> disc edge
    float q  = clamp((p - 0.20) / 0.32, 0.0, 1.0);  // disc edge -> its centre
    float m  = clamp((p - 0.60) / 0.40, 0.0, 1.0);  // centre -> top of magnet

    // The bowl (not a flat annulus) is deliberate: neighbouring plates overlap
    // in the array, and two coplanar plates would z-fight.  2.85 (not the disc's
    // own 1.15) is what makes the plates of adjacent assemblies actually meet.
    float rPlate = mix(2.85, 1.15, qp);
    float hPlate = -0.34 - 0.20 * (1.0 - qp) * (1.0 - qp);

    float rDisc = mix(1.15, 0.07, q);
    float hDisc = -0.34 + 0.10 * q * q;

    float rMag  = 0.52 * sin(m * 2.8902 + 0.12);
    float hMag  = levGap - 0.18 + 0.46 * m;

    return vec2(mix(mix(rDisc, rMag, magPart), rPlate, platePart),
                mix(mix(hDisc, hMag, magPart), hPlate, platePart));
}

void main()
{
    // WHICH ASSEMBLY.  Derived from the CELL INDEX, so all six vertices of a
    // cell agree; deriving it from attrA.xy instead would put the two corners
    // of a boundary cell in different blocks and stretch that triangle right
    // across the frame.
    float cell = attrA.w;
    float cx = mod(cell, 220.0);
    float cy = floor(cell / 220.0);
    float bx = floor(cx / 55.0);              // 0..3
    float bz = floor(cy / 60.0);              // 0..1
    float b  = bz * 4.0 + bx;                 // 0..7

    // Block-local patch uv.  Exact at the seams: the last cell of a block ends
    // at attrA.x = (bx+1)*0.25, i.e. lu = 1.0, so the revolution closes.
    vec2 luv = vec2(attrA.x * 4.0 - bx, attrA.y * 2.0 - bz);
    vUV = luv;

    float h1 = fract(sin(b * 12.9898 + 4.1) * 43758.5453);
    float h2 = fract(sin(b * 78.2330 + 1.7) * 24634.6345);
    float h3 = fract(sin(b * 39.4250 + 9.3) * 15731.7431);

    // Base rate raised from 0.35: the only mover was a sin(t*2.0) levitation
    // bob of amplitude 0.1, i.e. 0.7 rad/s over a tenth of a unit -- the frame
    // was effectively a still (measured motion 0.0043).
    float t = time * 0.55 + audioAdvance * 0.3;

    float u = (luv.x * 2.0 - 1.0) * 3.14159265;     // angle around the axis

    // diskScaleP stays the size knob, but remapped into a narrow band: eight
    // assemblies share the frame now, and its old 0.8..2.2 range would swing
    // between a tiny model and one that clipped through the near plane.
    float dsp   = (diskScaleP > 0.01 ? diskScaleP : 1.3);
    float scale = (0.72 + 0.13 * dsp) * (0.92 + 0.16 * audioSwell) * (0.86 + 0.28 * h3);

    // Magnetic levitation gap -- each assembly bobs on its own phase.
    float levGap = (levitateDistP > 0.01 ? levitateDistP : 0.8)
                 + sin(t * 1.3 + h1 * 6.2831853) * 0.12;

    // The patch's SECOND coordinate never entered the geometry: the old position
    // was (r*cos(u), zPos, r*sin(u)) where r and zPos depended only on a step in
    // uv.y, so every row of the grid mapped onto the SAME circle. A 2D patch
    // collapsed into two 1D rings -- there was no disc and no magnet, just a pair
    // of wireframe hoops on a black frame. uv.y is now the profile coordinate
    // and the patch sweeps a real solid of revolution.
    float p = luv.y;
    vec2  pr  = mpProfile(p, levGap);
    vec2  pr1 = mpProfile(p + 0.012, levGap);
    vec2  dP  = pr1 - pr;

    // Azimuthal flux-pinning ripple: a rotating 6-fold standing wave. Without it
    // the object is a perfect solid of revolution, so spinning it about its own
    // axis would produce no visible change at all.
    float discW = 1.0 - smoothstep(0.34, 0.52, p);
    float ripple = 0.055 * sin(u * 6.0 + t * 1.5 + h2 * 6.2831853) * discW;

    // The trapped magnet precesses over its pinning sites -- real motion, not
    // just a brightness pulse.
    float magPart = smoothstep(0.545, 0.72, p);
    float pa = t * 0.9 + h1 * 6.2831853;
    vec3  prec = vec3(cos(pa), 0.0, sin(pa)) * 0.09 * magPart;

    // The eight assemblies sit on a 4 x 2 wall-grid facing the camera (with a
    // little depth jitter), so they span the frame instead of receding into a
    // floor whose horizon leaves the top half empty.  The staggered height is
    // deterministic as well as random: two neighbouring cold plates that landed
    // at the same height would overlap COPLANAR and z-fight.
    float yStagger = 0.17 * (mod(bx, 2.0) - 0.5) + 0.11 * (mod(bz, 2.0) - 0.5);
    vec3 cellPos = vec3((bx - 1.5) * 2.40 + (h1 - 0.5) * 0.30,
                        (bz - 0.5) * 2.60 + (h3 - 0.5) * 0.24 + yStagger,
                        (h2 - 0.5) * 1.30);

    vec3 worldPos = cellPos
                  + (vec3(pr.x * cos(u), pr.y + ripple, pr.x * sin(u)) + prec) * scale;

    // Normal of the surface of revolution: cross(dAngle, dProfile) reduces to
    // (-cos*dh, dr, -sin*dh). Varies with BOTH angle and profile position -- the
    // old constant (0, +/-1, 0) made every lit term identical across each half of
    // the object, which is the other half of why the frame was flat.
    vec3 nrm = vec3(-cos(u) * dP.y, dP.x, -sin(u) * dP.y);
    // The profile runs rim -> centre, so dP.x is negative over most of it and
    // the raw cross product points INTO the body: the wide cold plate would be
    // lit from underneath and read as a flat dark disc.  These are single-sided
    // decorative surfaces, so simply face them upward.
    if (nrm.y < 0.0) nrm = -nrm;
    vNormal = normalize(nrm + vec3(1e-6));

    // Curved magnetic flux expulsion pinch: hottest in the column that bridges
    // the gap, with a second ring on the YBCO disc's rim where the field wraps.
    float pinch   = exp(-abs(p - 0.565) * 15.0);
    float rimGlow = exp(-abs(p - 0.210) * 24.0);
    vMeissnerGlow = (pinch * 1.15 + rimGlow * 0.75) * (1.0 + 3.5 * audioKick);

    vCol = imgPalette(fract(pr.x * 0.3 + magPart * 0.5 + h1 * 0.37 + audioCentroid));

    // Camera Transform (V3): tilt BEFORE the translate (after it, the fixed
    // tilt swings the scene centre down by sin(tilt)*4.5).  The sign is
    // NEGATIVE so the camera looks slightly DOWN on the array -- with the old
    // +0.55 the nearer assemblies rode up and the far ones sank, which reads
    // as looking up at the underside of the bed.
    vec3 vp = worldPos;
    float tilt = -0.52;
    float c = cos(tilt), s = sin(tilt);
    vp = vec3(vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c);
    vp.z += 4.5;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    if (vp.z < 0.55)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
}
