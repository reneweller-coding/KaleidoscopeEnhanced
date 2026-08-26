#version 330 core
/**
 * @file Creature.vert
 * @brief Vertex stage companion to Creature.frag -- see that file's header.
 * This is where the animation actually lives: the loaded mesh is a STATIC
 * pose with no skeleton, so the swimming is done by deforming object space
 * per vertex. Four modes, picked per-instance by deformP, because a
 * jellyfish, a manta, a whale and a squid move in genuinely different ways
 * and one generic wobble would make all four read as the same animal:
 *   0 = bell pulse      (jellyfish: bell contracts, tentacles trail behind)
 *   1 = wing flap       (manta: amplitude grows toward the wingtips)
 *   2 = body undulation (whale/seahorse/anglerfish: wave travelling tailward)
 *   3 = tentacle writhe (squid: twist about the long axis + per-strand wave)
 *
 * All phases are built from `time` plus audioAdvance (the host-INTEGRATED
 * musical phase), never from `time` multiplied by a live audio value -- a
 * rate that jumps would make the whole body snap to a new pose on every
 * beat instead of swimming faster.
 *
 * gl_VertexID picks the vertex's own branch: below meshVertexCount it is
 * the loaded model, at or above it the enclosing sky shell
 * Scene3DShader::buildGeometry() appends -- Creature.frag paints the
 * underwater column onto that shell.
 */

in vec4 attrA;   // mesh: xyz = object-space position, w = U.  shell: xyz = world-space position on the shell.
in vec4 attrB;   // mesh: xyz = object-space normal,   w = V.  shell: xyz = outward direction (reused as "sky direction").

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform int   meshVertexCount;

uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;

uniform float sizeP;
uniform float deformP;   // which of the four modes above
uniform float ampP;      // deformation amplitude
uniform float freqP;     // deformation rate

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
        float sz = (sizeP > 0.01 ? sizeP : 1.0);
        float amp = (ampP  > 0.01 ? ampP  : 1.0);
        float frq = (freqP > 0.01 ? freqP : 1.0);
        int   mode = int(deformP + 0.5);

        vec3 p = attrA.xyz;                 // ~[-0.5, 0.5]
        vec3 nrm = attrB.xyz;

        // One shared phase, so a body's wave and its own limbs stay in step.
        float phase = (time * 1.15 + audioAdvance * 0.55) * frq;
        // The music makes the stroke deeper, not faster -- speed changes
        // read as the animation glitching, depth reads as effort.
        float drive = amp * (0.75 + 0.45 * audioSwell + 0.35 * audioKick);

        if (mode == 0)
        {
            // BELL PULSE. The bell (upper body) squashes radially while
            // stretching along its axis, roughly conserving volume, which is
            // what makes a real medusa look like it is pushing water rather
            // than just inflating. Tentacles hang below and lag behind by an
            // amount proportional to how far down they are.
            float pulse = sin(phase);
            float bell = smoothstep(-0.05, 0.35, p.y);
            float squash = 1.0 + 0.20 * pulse * drive * bell;
            float stretch = 1.0 - 0.14 * pulse * drive * bell;
            p.xz *= squash;
            p.y  *= stretch;

            float below = max(-p.y - 0.02, 0.0);
            float lagged = sin(phase - below * 5.5);
            p.xz += vec2(lagged, lagged * 0.6) * 0.16 * drive * below;
        }
        else if (mode == 1)
        {
            // WING FLAP. Amplitude grows toward the wingtips and the phase
            // is delayed with distance from the spine, so the stroke rolls
            // outward along the wing instead of the whole plane hinging.
            float span = abs(p.x) * 2.0;
            float flap = sin(phase - span * 1.7);
            p.y += flap * 0.26 * drive * pow(span, 1.6);
            // The body dips slightly opposite the wings, as a counterweight.
            p.y -= sin(phase) * 0.03 * drive * (1.0 - span);
        }
        else if (mode == 2)
        {
            // BODY UNDULATION. A wave travelling from head to tail; the
            // head barely moves, the tail sweeps. Long axis is z.
            float along = p.z + 0.5;                   // 0 at the head, 1 at the tail
            float wave = sin(phase - along * 4.2);
            p.x += wave * 0.18 * drive * pow(along, 1.8);
            p.y += cos(phase - along * 4.2) * 0.04 * drive * pow(along, 2.0);
        }
        else
        {
            // TENTACLE WRITHE. A gentle twist about the long axis for the
            // mantle, plus a per-strand wave below: hashing on the angle
            // around the axis gives neighbouring tentacles their own phase,
            // so they writhe independently instead of moving as one skirt.
            float below = max(-p.y + 0.1, 0.0);
            float strand = atan(p.z, p.x);
            float w = sin(phase * 1.3 - below * 4.0 + strand * 2.0);
            p.xz += vec2(cos(strand), sin(strand)) * w * 0.13 * drive * below;

            float twist = sin(phase * 0.6) * 0.25 * drive * (p.y + 0.5);
            float ct = cos(twist), st = sin(twist);
            p.xz = mat2(ct, st, -st, ct) * p.xz;
            nrm.xz = mat2(ct, st, -st, ct) * nrm.xz;
        }

        vec3 local = p * (30.0 * sz);

        // A slow drift so the animal is seen from several sides, and a lazy
        // vertical glide -- it is swimming, not mounted on a turntable.
        float rotY = time * 0.11 + audioAdvance * 0.06;
        float cy = cos(rotY), sy = sin(rotY);
        mat3 rotYMat = mat3(cy, 0.0, -sy,   0.0, 1.0, 0.0,   sy, 0.0, cy);
        const float tiltX = 0.12;
        float cx = cos(tiltX), sx = sin(tiltX);
        mat3 rotXMat = mat3(1.0, 0.0, 0.0,   0.0, cx, sx,   0.0, -sx, cx);
        mat3 rotMat = rotXMat * rotYMat;

        world = rotMat * local;
        world.z += 85.0;
        world.y += 3.0 * sin(time * 0.17) + 1.2 * audioKick;

        // Deforming the position leaves the normal stale. Rebuilding it
        // properly would need the deformation's Jacobian; for these smooth,
        // low-frequency bends the visible error is small, so the normal is
        // only carried through the rigid part of the transform.
        n = normalize(rotMat * nrm);
        vUV = vec2(attrA.w, attrB.w);
        vLocalPos = attrA.xyz;
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
    // The shell is a CUBE of half-side kSkyShellRadius, so its corners sit
    // sqrt(3) times further out than its faces -- past kSceneFar, which
    // clipped visible wedges out of the sky. Pinning shell depth just inside
    // the far plane is the standard skybox fix: no far-plane clipping however
    // big the shell is, and it can never occlude the object in front of it.
    if (isBg) gl_Position.z = gl_Position.w * 0.999999;

    vNormal = n;
    vPos = world;
    vBg = isBg ? 1.0 : 0.0;
}
