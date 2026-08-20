#version 330 core
/**
 * @file LaserSpireArray.geom
 * @brief Geometry stage companion to LaserSpireArray.frag -- see that file's header for
 * this scene's description.
 *
 * Audio Reactivity:
 *   audioSpectrum -> per-spire height (each spire reads its own FFT band)
 *   audioKick     -> height punch on a subset of spires + gold tint
 *   audioAdvance  -> ring rotation + camera orbit (pre-integrated, jump-free)
 *   audioBuildUp  -> rising EDM tension stretches the sky beams upward, the
 *                    classic riser, and they fall back after the drop
 *   audioTrebRel  -> mix-independent treble punch thickens the laser columns
 *   audioUpperMid -> (fragment stage) metallic chrome glint on the facets
 */
// LaserSpireArray.geom — Extrude point seeds into 3D hexagonal crystalline spires
// with skyward laser beams and pulsating energy rings.
layout(points) in;
layout(triangle_strip, max_vertices = 24) out;

in vec3  vObjPos[];
in vec4  vSeeds[];
in float vSpireIndex[];

out vec3  gNormal;
out vec3  gWorld;
out vec4  gCol;
out float gBeam;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioAdvance;
uniform float audioKick;
uniform float audioSubBass;
uniform float audioHigh;
uniform float audioSpectrum[32];
uniform float audioBuildUp;   // EDM tension rising toward the drop
uniform float audioTrebRel;   // 0..2.5, treble "as loud as usual right now"

uniform float heightP;
uniform float beamP;
uniform float camDistP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void emitVert(vec3 worldPos, vec3 norm, vec3 col, float isBeam, vec3 camPos, vec3 uu, vec3 vv, vec3 ww) {
    vec3 relP = worldPos - camPos;
    vec3 viewP = vec3(dot(relP, uu), dot(relP, vv), dot(relP, ww));
    viewP.x -= eyeOff;

    gl_Position = projM * vec4(viewP.x, viewP.y, -viewP.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    gNormal = norm;
    gWorld = worldPos;
    gCol = vec4(col, 1.0);
    gBeam = isBeam;
    EmitVertex();
}

void main() {
    float idx = vSpireIndex[0];
    vec4 seeds = vSeeds[0];

    // Select a subset of the 60,000 points (e.g. 1,200 spires) to keep high performance & sharp detail
    if (idx > 1200.0) return;

    float hgt = (heightP  > 0.0) ? heightP  : 1.0;
    float bm  = (beamP    > 0.0) ? beamP    : 1.0;
    float cDst= (camDistP > 0.0) ? camDistP : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    // Spire grid placement in concentric rings
    float r = 2.0 + seeds.x * 26.0;
    float a = seeds.y * 6.2831853 + time * (0.05 + seeds.z * 0.05) + audioAdvance * 0.05;
    vec3 basePos = vec3(cos(a) * r, -4.0, sin(a) * r);

    // Spectrum height modulation
    int band = int(clamp(seeds.x * 31.0, 0.0, 31.0));
    float spireH = (3.0 + 8.0 * pow(seeds.w, 1.5) + audioSpectrum[band] * 12.0) * hgt;
    spireH += audioKick * 3.0 * step(0.7, seeds.z);

    float spireRadius = 0.35 * (0.7 + 0.3 * seeds.z);

    // Camera
    float camAngle = time * 0.15 + audioAdvance * 0.05;
    float camDist = (30.0 * cDst);
    vec3 camPos = vec3(sin(camAngle) * camDist, 12.0 + 4.0 * sin(time * 0.2), cos(camAngle) * camDist);
    vec3 lookTarget = vec3(0.0, 2.0, 0.0);

    vec3 ww = normalize(lookTarget - camPos);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);

    // Base color
    vec3 spireCol = mix(vec3(0.0, 0.9, 1.0), vec3(1.0, 0.1, 0.7), seeds.x);
    spireCol = mix(spireCol, vec3(1.0, 0.9, 0.3), audioKick * 0.8);
    if (hue > 0.001) spireCol = hueRot(spireCol, hue);

    // Generate 4-sided spire pillar triangle strip (8 vertices)
    const int SIDES = 4;
    for (int s = 0; s <= SIDES; s++) {
        float angle = float(s) * (6.2831853 / float(SIDES));
        vec3 offset = vec3(cos(angle), 0.0, sin(angle)) * spireRadius;
        vec3 norm = normalize(vec3(cos(angle), 0.1, sin(angle)));

        vec3 bVert = basePos + offset;
        vec3 tVert = basePos + offset * 0.4 + vec3(0.0, spireH, 0.0);

        emitVert(bVert, norm, spireCol * 0.6, 0.0, camPos, uu, vv, ww);
        emitVert(tVert, norm, spireCol * 1.5, 0.0, camPos, uu, vv, ww);
    }
    EndPrimitive();

    // Laser sky beam extending from apex.  An EDM build-up is the RISER: the
    // beams stretch further and further into the sky as the tension climbs,
    // then settle back once the drop releases it.  (The beam fades to black
    // along its length, so the extra reach stays dim -- no exposure blow-out.)
    if (seeds.z > 0.5) {
        float riser = 1.0 + 0.40 * clamp(audioBuildUp, 0.0, 1.0);

        // Treble punch relative to this mix's own average thickens the columns
        // — a hi-hat-heavy bar fattens the lasers regardless of master level.
        float trebPunch = clamp(audioTrebRel - 1.0, -0.8, 1.0);
        float beamW = 0.12 * (1.0 + 0.45 * trebPunch);

        vec3 tipPos = basePos + vec3(0.0, spireH, 0.0);
        vec3 beamEnd = tipPos + vec3(0.0, 35.0 * bm * riser, 0.0);
        vec3 beamCol = mix(vec3(0.2, 1.0, 0.8), vec3(1.0, 0.3, 0.9), seeds.w);

        vec3 bOff1 = vec3(beamW, 0.0, 0.0);
        vec3 bOff2 = vec3(-beamW, 0.0, 0.0);

        emitVert(tipPos + bOff1, vec3(0.0, 1.0, 0.0), beamCol * 2.5, 1.0, camPos, uu, vv, ww);
        emitVert(tipPos + bOff2, vec3(0.0, 1.0, 0.0), beamCol * 2.5, 1.0, camPos, uu, vv, ww);
        emitVert(beamEnd + bOff1, vec3(0.0, 1.0, 0.0), beamCol * 0.0, 1.0, camPos, uu, vv, ww);
        emitVert(beamEnd + bOff2, vec3(0.0, 1.0, 0.0), beamCol * 0.0, 1.0, camPos, uu, vv, ww);
        EndPrimitive();
    }
}
