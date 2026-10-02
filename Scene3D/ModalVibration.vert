#version 330 core
/**
 * @file ModalVibration.vert
 * @brief Vertex stage for ModalVibration.frag: the model is displaced by
 * standing waves, as if the music were exciting it into its own resonances.
 *
 * The distinction that matters: this does not PUSH the object around, it makes
 * it RING. Four spectral bands drive four spatial modes, from one slow lobe over
 * the whole body down to a fine ripple -- low frequencies move a lot of surface
 * slowly, high frequencies move a little surface quickly, which is the actual
 * behaviour of a struck plate and is why it reads as sound rather than as
 * animation.
 *
 * Displacement is along the NORMAL and driven by a function of the object-space
 * position, so the pattern is fixed to the body: a node stays a node while the
 * object turns, exactly as a nodal line on a Chladni plate does.
 */

in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform int   meshVertexCount;   ///< Vertices of the scene's mesh.
uniform vec3  meshExtent;   ///< Half size of the scene's mesh bounding box.
uniform vec3  meshCenter;   ///< Centre of the scene's mesh bounding box.

uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioLowMid;
uniform float audioMid;   ///< Mid band level, 0..1.
uniform float audioUpperMid;
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).

uniform float sizeP;   ///< Size knob, 0..1.
uniform float spinP;   ///< Spin knob, 0..1.
uniform float gainP;     ///< per-instance displacement scale

out vec2  vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec3  vNormal;   ///< Surface normal (from the vertex stage).
out vec3  vPos;   ///< Position (from the vertex stage).
out vec3  vLocalPos;   ///< Object-space position (from the vertex stage).
out float vAmp;          ///< signed displacement, for the fragment stage
out float vBg;   ///< Background flag (from the vertex stage).

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec3 world, n;
    bool isBg = gl_VertexID >= meshVertexCount;

    if( !isBg )
    {
        float sz = (sizeP > 0.01 ? sizeP : 1.0);
        float g  = (gainP > 0.01 ? gainP : 1.0);
        vec3 p = attrA.xyz - meshCenter;
        vec3 nrm = normalize(attrB.xyz);

        // Normalise into the model's own box so the mode wavelengths mean the
        // same thing on a long thin hull as on a squat one.
        vec3 q = p / meshExtent;

        // The direction of travel is the model's THINNEST axis -- for a plate,
        // a cymbal or a bell wall that is the thickness direction, and it is
        // the direction such a body actually moves in. The first attempt
        // displaced along the surface normal instead, which on an irregular
        // hull inflates and deflates every bump independently: the render read
        // as melting wax, not as something ringing.
        vec3 e3 = meshExtent;
        vec3 flex = (e3.x <= e3.y && e3.x <= e3.z) ? vec3(1.0, 0.0, 0.0)
                  : (e3.y <= e3.x && e3.y <= e3.z) ? vec3(0.0, 1.0, 0.0)
                                                   : vec3(0.0, 0.0, 1.0);

        // FOUR modes, not six. The top two contributed spatial frequencies
        // finer than the eye can separate at this size -- they read as noise
        // laid over the shape and buried the pattern the low modes make. Their
        // energy is folded into the ones that can actually be seen.
        float amp = 0.0;
        amp += audioSubBass  * 1.00 * sin(1.6 * dot(q, vec3(0.2, 1.0, 0.3)) + time * 2.7);
        amp += audioBass     * 0.80 * sin(2.7 * q.x - time * 3.9) * cos(2.2 * q.z);
        amp += (audioLowMid + audioMid) * 0.45
                             * sin(4.3 * q.z + time * 6.0) * cos(3.5 * q.y);
        amp += (audioUpperMid + audioHigh) * 0.20
                             * sin(7.9 * q.x + time * 10.2) * cos(6.4 * q.z);

        // A strike: the kick briefly drives every mode at once, the way hitting
        // a bell excites its whole spectrum before the highs die away first.
        amp *= 1.0 + 1.6 * audioKick;

        float disp = amp * 0.105 * g;
        p += flex * disp * max(dot(abs(flex), meshExtent), 0.05) * 2.2;
        vAmp = amp;

        // Bounding-SPHERE framing, not longest-axis framing. Normalising the
        // longest half-axis to 0.5 bounds nothing once the model turns: the
        // diagonal reaches 0.5*sqrt(3), 1.7x the assumed size, which is why a
        // torus or a bell was cropped mid-frame (reported). The extents'
        // LENGTH is the bounding-sphere radius -- rotation-proof -- and the
        // scene's 55-degree frustum shows a half-height of 0.52*z, so the
        // scale below keeps the whole object inside with margin at any angle.
        // (Slightly tighter margin here: the flex displacement can grow the
        // radius by ~20%, which the 31-of-39.5 headroom absorbs.)
        float fit = 31.0 / 84.0 / max(length(meshExtent), 1e-5);
        // Rotation on TIME alone. audioAdvance integrates a beat-driven rate,
        // so anything it turns visibly speeds up on every kick -- measured as
        // residual beat-periodic motion (autocorr 0.46 @ 1s) after every other
        // coupling was removed. The summed coefficient keeps the average pace.
        float rotY = time * 0.14 * spinP;
        float cy = cos(rotY), sy = sin(rotY);
        mat3 spin = mat3(cy, 0.0, -sy,  0.0, 1.0, 0.0,  sy, 0.0, cy);
        const float tiltX = 0.18;
        float cx = cos(tiltX), sx = sin(tiltX);
        mat3 tilt = mat3(1.0, 0.0, 0.0,  0.0, cx, sx,  0.0, -sx, cx);
        mat3 rot = tilt * spin;

        world = rot * (p * (84.0 * sz * fit));
        world.z += 76.0;
        n = normalize(rot * nrm);
        vUV = vec2(attrA.w, attrB.w);
        vLocalPos = q;
        vBg = 0.0;
    }
    else
    {
        world = attrA.xyz;
        n = normalize(attrB.xyz);
        vUV = vec2(0.0);
        vLocalPos = vec3(0.0);
        vAmp = 0.0;
        vBg = 1.0;
    }

    vNormal = n;
    vPos = world;

    vec3 vp = vec3(world.x - eyeOff, world.y, world.z);
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    if( isBg ) gl_Position.z = gl_Position.w * 0.999999;
}
