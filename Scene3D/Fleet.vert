#version 330 core
/**
 * @file Fleet.vert
 * @brief One loaded craft, drawn as a whole formation. geom="mesh" with
 * instances="N" on the scene entry: the same buffer is drawn N times and this
 * stage places each copy from gl_InstanceID.
 *
 * Every other mesh family shows one object, or two. A formation is a different
 * kind of image entirely -- what the eye reads is the ORDER, and the individual
 * craft stops mattering. That also means the interesting audio coupling is not
 * on the ships but on the geometry between them: the formation closes up and
 * opens out, and a drop breaks it.
 *
 * The sky shell is in the SAME buffer as the mesh, so it would be drawn N times
 * on top of itself. Instance 0 keeps it; every other instance collapses it to a
 * degenerate point. That costs nothing and needs no second draw call.
 */

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform int   meshVertexCount;
uniform int   meshInstances;
uniform vec3  meshExtent;
uniform vec3  meshCenter;

uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioDrop;

uniform float sizeP;
uniform float formP;      // 0 = wedge, 1 = column, 2 = sphere shell
uniform float spreadP;    // formation spacing

out vec2  vUV;
out vec3  vNormal;
out vec3  vPos;
out float vBg;
out float vRank;          // 0 at the lead craft, 1 at the trailing edge

float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

void main()
{
    bool isBg = gl_VertexID >= meshVertexCount;
    int  inst = gl_InstanceID;
    int  N    = max(meshInstances, 1);

    if( isBg )
    {
        // One backdrop, not N. Collapse the shell on every instance but the
        // first: the vertices land on the same clip-space point, the triangle
        // has zero area and nothing is rasterised.
        if( inst > 0 )
        {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            vUV = vec2(0.0); vNormal = vec3(0.0, 1.0, 0.0); vPos = vec3(0.0);
            vBg = 1.0; vRank = 0.0;
            return;
        }
        vec3 w = attrA.xyz;
        vNormal = normalize(attrB.xyz);
        vPos = w; vUV = vec2(0.0); vBg = 1.0; vRank = 0.0;
        vec3 vp = vec3(w.x - eyeOff, w.y, w.z);
        gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
        gl_Position.z = gl_Position.w * 0.999999;
        return;
    }

    float sz  = (sizeP > 0.01 ? sizeP : 1.0);
    float spr = (spreadP > 0.01 ? spreadP : 1.0);

    // How long one craft is on screen. p is normalised by `fit` further down,
    // so it spans +-0.5 and this IS the length. Every spacing below is a
    // multiple of it, which is the only way the formation survives a change of
    // craft size: raising the size from 13 to 19 without touching the spacings
    // turned the fleet into a solid wall of overlapping hulls.
    float craft = 19.0 * sz;
    float fi  = float(inst);
    float fn  = float(N);

    // ---- the pass -------------------------------------------------------
    // The formation FLIES PAST, it does not hover. The first version parked
    // the wedge mid-frame and let every craft wobble on station -- which read
    // as ships jiggling in vacuum (reported, fairly, as looking silly). Now
    // the whole formation travels a straight line from deep ahead to past the
    // camera's shoulder, at constant speed the way masses under way actually
    // move. Two squadrons run the same path half a cycle apart on mirrored
    // sides, so the sky is never empty; the wrap from near back to far happens
    // outside the frustum (the end point is well off-screen), so it never pops.
    float phase  = time * 0.65 / 26.0;   // time alone: advance jerks the whole squadron on kicks
    // Front half of the instance range = squadron 0, back half = squadron 1,
    // and all slot maths below runs on the LOCAL index -- an alternating split
    // would punch every second hole into each wedge.
    float fnHalf = max(floor(fn * 0.5), 1.0);
    float squad  = (fi < fnHalf) ? 0.0 : 1.0;
    float fj     = fi - squad * fnHalf;
    float fnSq   = (squad < 0.5) ? fnHalf : max(fn - fnHalf, 1.0);
    float u      = fract(phase + 0.5 * squad);
    float mirror = squad > 0.5 ? -1.0 : 1.0;
    vec3 pStart  = vec3( 14.0 * mirror,  2.0, 205.0);
    vec3 pEnd    = vec3(-46.0 * mirror, -9.0,  12.0);
    vec3 centre  = mix(pStart, pEnd, u);
    vec3 fwd     = normalize(pEnd - pStart);

    // The spacing no longer breathes with the BEAT -- even relative motion
    // between hulls in time read as the ships twitching (reported). A slow
    // autonomous swell keeps the formation alive; the music stays in the
    // running light and the engine glow.
    float tighten = 1.0 - 0.05 * sin(time * 0.22);
    float breakUp = clamp(audioDrop, 0.0, 1.0);

    vec3 slot;
    int mode = int(clamp(formP, 0.0, 2.0) + 0.5);
    if( mode == 0 )
    {
        // Wedge: rank r, side s. The classic V, and the one arrangement that
        // reads instantly as a formation rather than as a crowd.
        float r = floor(sqrt(fj));
        float s = fj - r * r - r;                 // -r .. +r across the rank
        slot = vec3(s * craft * 1.45, (-abs(s) * 1.2 + r * 0.6) * craft * 0.09,
                    r * craft * 0.95);
    }
    else if( mode == 1 )
    {
        // Column, three abreast: a convoy seen from beside the road.
        float col = mod(fj, 3.0) - 1.0;
        float row = floor(fj / 3.0);
        slot = vec3(col * craft * 1.70, sin(row * 1.7) * craft * 0.18,
                    row * craft * 1.05);
    }
    else
    {
        // A shell: the craft englobe something. Fibonacci placement, so they
        // are evenly spread rather than bunched at the poles.
        float k = (fj + 0.5) / fnSq;
        float phi = acos(1.0 - 2.0 * k);
        float th = 3.8832220774509327 * fj;       // golden angle
        slot = vec3(sin(phi) * cos(th), cos(phi), sin(phi) * sin(th)) * craft * 2.60;
    }

    slot *= spr * tighten;

    // The drop scatters them: each craft gets a fixed random direction, so the
    // formation blows apart coherently and reassembles the same way.
    vec3 blow = normalize(vec3(hash11(fi * 3.1) - 0.5,
                               hash11(fi * 7.7) - 0.5,
                               hash11(fi * 5.3) - 0.5) + vec3(0.0001));
    // (the drop no longer blows the formation apart, V7d)

    // A TRACE of station-keeping. The old 0.09-craft wobble at ~1 Hz was the
    // single most-criticised thing in the scene -- warships jiggling in vacuum.
    // 0.015 craft-lengths at a third the rate is drift you feel, not motion
    // you see.
    float ph = fi * 2.399963;
    slot += vec3(sin(time * 0.31 + ph), sin(time * 0.24 + ph * 1.3), sin(time * 0.37 + ph * 0.7)) * craft * 0.015;

    // ---- the craft itself ------------------------------------------------
    vec3 p = attrA.xyz - meshCenter;
    vec3 nrm0 = attrB.xyz;
    float fit = 0.5 / max(max(meshExtent.x, meshExtent.y), meshExtent.z);

    // Put the craft's LONGEST axis on Z, nose toward -Z; the attitude matrix
    // below then rotates that nose onto the squadron's actual path direction.
    // Without this the whole formation flies in
    // whatever direction the asset happens to have been modelled in, and the
    // bank below turns about an axis that is not the nose -- a craft rolling
    // about its beam rather than its length. Rotations, not axis swaps.
    vec3 e = meshExtent;
    if( e.x >= e.y && e.x >= e.z )        // longest on X: rotate about Y
    {
        p    = vec3(-p.z,    p.y,    p.x);
        nrm0 = vec3(-nrm0.z, nrm0.y, nrm0.x);
    }
    else if( e.y >= e.x && e.y >= e.z )   // longest on Y: rotate about X
    {
        p    = vec3(p.x,    -p.z,    p.y);
        nrm0 = vec3(nrm0.x, -nrm0.z, nrm0.y);
    }

    // Constant gentle bank -- ships hold attitude on a straight run; the old
    // per-craft sine bank was part of the jiggle.
    float bank = 0.10 * mirror;
    float cb = cos(bank), sb = sin(bank);
    mat3 roll = mat3(cb, sb, 0.0,  -sb, cb, 0.0,  0.0, 0.0, 1.0);

    // Point the nose along the PATH. After the axis alignment above the hull's
    // length lies on Z with the nose toward -Z, so yaw/pitch rotate -Z onto
    // the squadron's actual direction of travel -- craft that fly where they
    // are going, not sideways along a rail.
    float yaw = atan(fwd.x, -fwd.z);
    float cyw = cos(yaw), syw = sin(yaw);
    mat3 yawM = mat3(cyw, 0.0, -syw,  0.0, 1.0, 0.0,  syw, 0.0, cyw);
    float pit = asin(clamp(fwd.y, -1.0, 1.0));
    float cp = cos(pit), sp = sin(pit);
    mat3 pitM = mat3(1.0, 0.0, 0.0,  0.0, cp, sp,  0.0, -sp, cp);
    mat3 att = yawM * pitM * roll;

    // Slots ride the moving formation centre; the same attitude turns the slot
    // OFFSETS too, so the wedge stays a wedge seen from any bearing instead of
    // shearing as the formation crosses the frame.
    //
    // Camera clearance: a wide wedge crossing close by can run a hull
    // straight through the lens (reported). Each craft's CENTRE is kept
    // outside a safety bubble around the camera -- pushed radially onto its
    // surface, so a near ship slides AROUND the viewer instead of clipping
    // through. The whole hull moves as one (the push is per-craft, not
    // per-vertex), so the mesh never deforms.
    vec3 shipC = att * slot + centre;
    float rSafe = craft * 1.25 + 5.0;
    float dC = length(shipC);
    if( dC < rSafe )
        shipC *= rSafe / max(dC, 1e-3);
    vec3 world = att * (p * (craft * fit)) + shipC;

    vUV = vec2(attrA.w, attrB.w);
    vNormal = normalize(roll * nrm0);
    vPos = world;
    vBg = 0.0;
    vRank = fi / max(fn - 1.0, 1.0);

    vec3 vp = vec3(world.x - eyeOff, world.y, world.z);
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
}
