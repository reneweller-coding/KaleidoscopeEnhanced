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
    float fi  = float(inst);
    float fn  = float(N);

    // ---- where this craft sits in the formation -------------------------
    // Tight on the beat, loose between: the formation BREATHES, and that is
    // the only motion in the scene the eye can read as musical, since a hundred
    // identical craft moving individually would just be noise.
    float tighten = 1.0 - 0.28 * audioKick - 0.10 * audioSwell;
    float breakUp = clamp(audioDrop, 0.0, 1.0);

    vec3 slot;
    int mode = int(clamp(formP, 0.0, 2.0) + 0.5);
    if( mode == 0 )
    {
        // Wedge: rank r, side s. The classic V, and the one arrangement that
        // reads instantly as a formation rather than as a crowd.
        float r = floor(sqrt(fi));
        float s = fi - r * r - r;                 // -r .. +r across the rank
        slot = vec3(s * 13.0, -abs(s) * 1.2 + r * 0.6, -r * 17.0);
    }
    else if( mode == 1 )
    {
        // Column, three abreast: a convoy seen from beside the road.
        float col = mod(fi, 3.0) - 1.0;
        float row = floor(fi / 3.0);
        slot = vec3(col * 15.0, sin(row * 1.7) * 3.0, -row * 21.0);
    }
    else
    {
        // A shell: the craft englobe something. Fibonacci placement, so they
        // are evenly spread rather than bunched at the poles.
        float k = (fi + 0.5) / fn;
        float phi = acos(1.0 - 2.0 * k);
        float th = 3.8832220774509327 * fi;       // golden angle
        slot = vec3(sin(phi) * cos(th), cos(phi), sin(phi) * sin(th)) * 46.0;
    }

    slot *= spr * tighten;

    // The drop scatters them: each craft gets a fixed random direction, so the
    // formation blows apart coherently and reassembles the same way.
    vec3 blow = normalize(vec3(hash11(fi * 3.1) - 0.5,
                               hash11(fi * 7.7) - 0.5,
                               hash11(fi * 5.3) - 0.5) + vec3(0.0001));
    slot += blow * breakUp * (30.0 + 55.0 * hash11(fi * 1.9));

    // Station-keeping wobble, out of phase per craft: nothing holds formation
    // perfectly, and identical motion across N copies looks mechanical.
    float ph = fi * 2.399963;
    slot += vec3(sin(time * 0.9 + ph), sin(time * 0.7 + ph * 1.3), sin(time * 1.1 + ph * 0.7)) * 1.6;

    // ---- the craft itself ------------------------------------------------
    vec3 p = attrA.xyz - meshCenter;
    vec3 nrm0 = attrB.xyz;
    float fit = 0.5 / max(max(meshExtent.x, meshExtent.y), meshExtent.z);

    // Point the craft's LONGEST axis along the formation's line of flight
    // (-Z, toward the viewer). Without this the whole formation flies in
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

    // Bank into the turn, and lead craft bank first -- the wave travelling back
    // through the formation is what makes it look flown rather than placed.
    float bank = 0.30 * sin(time * 0.35 + audioAdvance * 0.12 - fi * 0.06);
    float cb = cos(bank), sb = sin(bank);
    mat3 roll = mat3(cb, sb, 0.0,  -sb, cb, 0.0,  0.0, 0.0, 1.0);

    // The bank turns about Z, which after the alignment above IS the nose
    // axis, so it banks rather than yaws.
    vec3 world = roll * (p * (13.0 * sz * fit)) + slot;
    world.z += 118.0;
    world.y += -6.0;

    vUV = vec2(attrA.w, attrB.w);
    vNormal = normalize(roll * nrm0);
    vPos = world;
    vBg = 0.0;
    vRank = fi / max(fn - 1.0, 1.0);

    vec3 vp = vec3(world.x - eyeOff, world.y, world.z);
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
}
