#version 330 core
/**
 * @file SmokeHall.vert
 * @brief Vertex stage companion to SmokeHall.frag -- see that file's header for
 * this scene's description.
 */
// SmokeHall.vert — place the hall, and hand each pass only the geometry that
// belongs to it.  Three passes, two kinds:
//   shadow      hall  (smoke must not cast, or it would shadow its own shafts)
//   opaque      hall
//   transparent smoke

in vec4 attrA;      ///< xyz = object position, w = kind (0 hall, 1 smoke)
in vec4 attrB;      ///< xyz = normal, w = material id / slab depth

out vec3  vObj;   ///< Object-space position (from the vertex stage).
out vec3  vNormal;   ///< Surface normal (from the vertex stage).
out vec3  vView;   ///< View vector (from the vertex stage).
out vec3  vWorld;   ///< World position (from the vertex stage).
out float vKind;   ///< Element kind (from the vertex stage).
out float vExtra;

uniform mat4  projM;   ///< Projection matrix.
uniform mat4  lightM;   ///< Light view-projection matrix (shadow map).
uniform float shadowPass;   ///< 1 during the shadow map's depth-only pass.
uniform float oitPass;   ///< Order-independent transparency pass flag.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float audioLevel;   ///< Overall loudness, 0..1.

uniform float camHP;   ///< Camera height knob, 0..1.

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float kind = attrA.w;
    bool isSmoke = (kind > 0.5);
    bool wantSmoke = (oitPass > 0.5) && (shadowPass < 0.5);

    if (isSmoke != wantSmoke)
    {
        gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
        vObj = vec3(0.0); vNormal = vec3(0.0, 1.0, 0.0);
        vView = vec3(0.0, 0.0, 1.0); vWorld = vec3(0.0);
        vKind = kind; vExtra = 0.0;
        return;
    }

    // Slide the whole scene so it straddles the origin.  The light's box is
    // centred there and sized once from shadowExtent, and anything outside it
    // gets "lit" for free from the shadow lookup's bounds guard.  The generator
    // builds the hall running from z = -8 to 26, which puts its middle nine
    // units down the corridor and half its length — including most of the smoke
    // — outside any box small enough to have usable resolution.  That is why the
    // volume came back uniformly lit: not a lighting bug, a framing one.
    vec3 p = attrA.xyz - vec3(0.0, 0.0, 9.0);

    // No rotation anywhere in this scene, on purpose: the smoke slabs are
    // perpendicular to the view axis and stop working the moment the scene
    // turns under them.  The motion is the hall scrolling past instead.
    // The eye sits BEHIND the first row of pillars.  Put it level with them and
    // the nearest column stands a couple of units off the lens, subtending most
    // of the frame — the hall stops reading as a hall and becomes a black shape.
    vec3 vp = vec3(p.x - eyeOff, p.y - camHP, p.z + 15.0);

    vObj    = p;
    vNormal = attrB.xyz;
    vView   = normalize(-vp);
    vWorld  = p;
    vKind   = kind;
    vExtra  = attrB.w;

    if (shadowPass > 0.5)
    {
        gl_Position = lightM * vec4(p, 1.0);
    }
    else
    {
        gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
        gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    }
}
