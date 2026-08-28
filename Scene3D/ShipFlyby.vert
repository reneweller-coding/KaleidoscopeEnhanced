#version 330 core
/**
 * @file ShipFlyby.vert
 * @brief Vertex stage companion to ShipFlyby.frag -- see that file's header.
 *
 * The whole point of this scene is the PASS, and a pass has a beginning, a
 * middle and an end, so it is staged on `sceneProgress` (0 at activation, 1
 * when the scene's solo time runs out) rather than on `time`. The ship is
 * therefore off-frame at both ends and closest at the halfway mark no matter
 * how long the scheduler happens to give this scene -- which is exactly the
 * "passage length tied to the scene length" behaviour asked for. Driving it
 * off `time` instead would make a short scene show a fragment of the pass
 * and a long one show the ship leave and never come back.
 *
 * Every ship in this batch came out of the generator NOSE ALONG +Z (measured
 * across all 80), so a fixed quarter turn about Y puts the long axis along
 * the travel direction and the ship flies nose-first.
 */

in vec4 attrA;   // mesh: xyz = object-space position, w = U.  shell: xyz = world-space position on the shell.
in vec4 attrB;   // mesh: xyz = object-space normal,   w = V.  shell: xyz = outward direction.

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform int   meshVertexCount;
uniform vec3  meshExtent;   // half-extents of model 1, object space
uniform float sceneProgress;      // 0 at activation -> 1 at the end of the solo span

uniform float audioKick;
uniform float audioSwell;

uniform float sizeP;      // ship scale; >1 overflows the frame at closest approach
uniform float travelP;    // how far it sweeps sideways
uniform float approachP;  // how much closer it comes at mid-pass
uniform float bankP;      // roll into the pass

out vec2  vUV;
out vec3  vNormal;
out vec3  vPos;
out vec3  vLocalPos;
out float vBg;

void main()
{
    vec3 world, n;
    bool isBg = gl_VertexID >= meshVertexCount;
    if( !isBg )
    {
        float sz  = (sizeP     > 0.01 ? sizeP     : 1.0);
        float trv = (travelP   > 0.01 ? travelP   : 1.0);
        float app = (approachP > 0.01 ? approachP : 1.0);

        // Put the hull's LONGEST axis along the direction of travel. This used
        // to be hardcoded as "the nose is +Z", which was true of the asset set
        // it was written against and false for the one that replaced it: three
        // of the ships now measure longest on X and would have flown sideways.
        // meshExtent is the model that ACTUALLY loaded, so the choice is made
        // from the geometry rather than from an assumption about it.
        //
        // Both branches are rotations, not axis swaps: exchanging two axes
        // mirrors the hull, which turns every asymmetric detail inside out and
        // reverses the winding.
        vec3 e = meshExtent;
        vec3 p = attrA.xyz, nrm = attrB.xyz;
        if( e.z >= e.x && e.z >= e.y )        // nose on +Z: rotate about Y
        {
            p   = vec3(p.z,   p.y,   -p.x);
            nrm = vec3(nrm.z, nrm.y, -nrm.x);
        }
        else if( e.y >= e.x && e.y >= e.z )   // nose on +Y: rotate about Z
        {
            p   = vec3(p.y,   -p.x,   p.z);
            nrm = vec3(nrm.y, -nrm.x, nrm.z);
        }
        // longest already on X: already pointing along travel, leave it alone.

        vec3 local = p * (90.0 * sz);

        float t = sceneProgress;
        float c = t * 2.0 - 1.0;             // -1 .. +1, 0 at closest approach

        // Sideways sweep, wide enough that the hull is fully off-frame at
        // both ends even at the largest sizeP.
        float x = c * 150.0 * trv;
        // Nearest at mid-pass. A parabola rather than a sine so the ship is
        // still visibly receding at the very ends instead of hanging there.
        float z = 150.0 - app * 78.0 * (1.0 - c * c);

        // Bank into the pass and pitch a touch nose-up, so we get a three-
        // quarter view of the hull rather than a flat broadside.
        //
        // The axes follow from the alignment above: the nose is on +X, so
        // rolling is a rotation about X and pitching one about Z. These two
        // were the other way round, which quietly turned the varying "bank"
        // into a pitch -- the ship nosed up and down through the pass and held
        // a fixed bank, instead of leaning into it. Both were object-space
        // rotations either way, which is why it looked plausible and wrong.
        float bank  = -c * 0.22 * bankP;      // about the nose axis, X
        float pitch =  0.06;                  // about the beam axis, Z
        float cb = cos(bank),  sb = sin(bank);
        float cp = cos(pitch), sp2 = sin(pitch);
        mat3 bankM  = mat3(1.0, 0.0, 0.0,  0.0, cb, sb,   0.0, -sb, cb);
        mat3 pitchM = mat3(cp, sp2, 0.0,  -sp2, cp, 0.0,  0.0, 0.0, 1.0);
        mat3 rotM = pitchM * bankM;

        world = rotM * local;
        world.x += x;
        world.z += z;
        world.y += -8.0 + 1.5 * audioKick;
        n = normalize(rotM * nrm);
        vUV = vec2(attrA.w, attrB.w);
        vLocalPos = p;
    }
    else
    {
        world = attrA.xyz;
        n = attrB.xyz;
        vUV = vec2(0.0);
        vLocalPos = vec3(0.0);
    }

    vec3 vp = world;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    // Shell cube corners reach sqrt(3)*radius, past the far plane; pin their
    // depth just inside it (see Tools/SHADER_AUTHORING.md's mesh section).
    if (isBg) gl_Position.z = gl_Position.w * 0.999999;

    vNormal = n;
    vPos = world;
    vBg = isBg ? 1.0 : 0.0;
}
