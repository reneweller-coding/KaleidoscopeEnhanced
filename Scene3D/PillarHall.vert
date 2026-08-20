#version 330 core
/**
 * @file PillarHall.vert
 * @brief Vertex stage companion to PillarHall.frag -- see that file's header for
 * this scene's description.
 */
// PillarHall.vert — a field of pillars on a floor, and the first scene to sign
// the shadow-map contract.
// -----------------------------------------------------------------------
// The engine cannot re-project a scene by itself: every scene places its OWN
// camera before applying projM, so handing it a light matrix in projM's place
// would light the scene from a direction that ignores that placement.  So the
// depth pass is opt-in, and this is what signing up looks like — compute the
// WORLD position as usual, then choose the matrix by shadowPass.
//
// The world position also goes down the pipeline, because the fragment shader
// needs it to look itself up in the shadow map.
// -----------------------------------------------------------------------
in vec4 attrA;      // xyz = unit-cube corner, w = cube index
in vec4 attrB;      // per-cube hashes

out vec3  vWorld;
out vec3  vNormal;
out float vKind;        // 0 = floor, 1 = pillar
out float vTint;
out float vHeight;      // 0 at the base, 1 at the top of this pillar

uniform mat4  projM;
uniform mat4  lightM;
uniform float shadowPass;
// Second, independent shadow-casting light (cool rim/fill) -- its own depth
// pass needs its own matrix here for the same reason light 1 does: the host
// cannot re-derive it, only the scene knows how it places its own camera.
uniform mat4  lightM2;
uniform float shadowPass2;
uniform float eyeOff;
uniform float audioAdvance;
uniform float audioLevel;
uniform float audioKick;
uniform float audioSubBass;
uniform float audioSpectrum[32];
uniform float sceneSeed;

uniform float camHP;
uniform float heightP;
uniform float spacingP;

// 30 x 30 pillars = 900 of the 4900 cubes.  At 16 x 16 the colonnade ran out
// long before the horizon did and most of the frame was empty floor and empty
// sky; a hall wants to recede until the haze closes it off.
const int GRID = 30;

void main()
{
    float idx = attrA.w;
    vec3 c = attrA.xyz;             // unit cube, -0.5 .. 0.5
    vec3 world;
    vec3 n = vec3(0.0, 1.0, 0.0);
    float kind = 1.0, height = 0.0;

    // Cube 0 is the floor: one cube stretched into a slab.  The alternative —
    // a second geometry kind for one quad — would cost an engine change for a
    // rectangle.
    if (idx < 0.5)
    {
        // Long enough to reach the 220-unit far plane in one piece: at
        // 400 x 400 centred on z = 80 the slab ended at z = 280 in front but
        // its FAR edge fell inside the frustum only because the haze hid it --
        // with the haze pushed out to 300 units the clipped edge would show as
        // a bare sliver of black sky just under the horizon line.
        world = c * vec3(500.0, 0.6, 620.0) + vec3(0.0, -0.3, 140.0);
        n = normalize(vec3(0.0, 1.0, 0.0));
        kind = 0.0;
    }
    else
    {
        float i = idx - 1.0;
        if (i >= float(GRID * GRID))
        {
            // Unused cubes are collapsed to nothing rather than skipped: the
            // vertex count is fixed by the buffer, so they have to go
            // somewhere, and a degenerate triangle costs no fill.
            gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
            vWorld = vec3(0.0); vNormal = n; vKind = 1.0; vTint = 0.0; vHeight = 0.0;
            return;
        }

        float gx = mod(i, float(GRID));
        float gz = floor(i / float(GRID));
        // The hall now runs well past the light's 120-unit box, the way a
        // colonnade wants to: everything outside the box simply comes back
        // unshadowed (see the explicit bounds test in PillarHall.frag's
        // shadowAt), so the crisp shadow play happens around the camera and
        // the far hall recedes into flat haze -- which is what distance looks
        // like anyway.
        float sp = spacingP * 6.5;

        // The spectrum sets each pillar's height, banded across the hall so a
        // chord raises a whole row rather than scattering.  These are COLUMNS
        // now, not the knee-high stubs they were: at 2..14 units they all sat
        // below an eye placed 6..13 up, so the camera looked out over the top
        // of the whole hall into an empty black sky.
        int band = int(clamp(gx / float(GRID) * 31.0, 0.0, 31.0));
        float e = audioSpectrum[band];
        // Kept under ~47 units at the loudest: the shadow light's box is 120
        // tall about the origin, and a pillar whose top leaves it stops
        // casting.
        float h = heightP * (7.0 + 20.0 * e * (0.5 + 0.9 * attrB.x))
                * (1.0 + 0.12 * audioKick);
        h = max(h, 6.0);

        vec3 size = vec3(2.2 + 1.4 * attrB.y, h, 2.2 + 1.4 * attrB.z);
        // Only four rows sit behind the eye; the rest recede into the haze.
        vec3 base = vec3((gx - float(GRID) * 0.5 + 0.5) * sp,
                         0.0,
                         (gz - 4.0) * sp);

        world = c * size + base + vec3(0.0, h * 0.5, 0.0);

        // Box normal from which face this corner belongs to: the largest
        // component of the unit-cube corner names the face.
        vec3 a = abs(c);
        n = (a.x > a.y && a.x > a.z) ? vec3(sign(c.x), 0.0, 0.0)
          : (a.y > a.z)             ? vec3(0.0, sign(c.y), 0.0)
                                    : vec3(0.0, 0.0, sign(c.z));
        height = c.y + 0.5;
    }

    // Slow lateral drift, applied to the WORLD so the shadow pass sees the
    // same geometry the camera does.
    // Drift stays INSIDE the corridor between two pillar columns
    // (spacing 6.5, pillar half-width up to 1.8): +-1.2 never collides.
    world.x += 1.2 * sin(audioAdvance * 0.05);

    vWorld  = world;
    vNormal = n;
    vKind   = kind;
    vTint   = attrB.w;
    vHeight = height;

    if (shadowPass2 > 0.5)
    {
        // Light 2's depth pass: same geometry, its OWN matrix.
        gl_Position = lightM2 * vec4(world, 1.0);
    }
    else if (shadowPass > 0.5)
    {
        // Light 1's depth pass: same geometry, the light's matrix.
        gl_Position = lightM * vec4(world, 1.0);
    }
    else
    {
        // Eye height, down INSIDE the colonnade.  camHP's 6..13 preset range
        // put the camera above nearly every pillar; at 1.6..4.5 the columns
        // tower over it and carry the picture to its top edge.
        float eyeY = 1.6 + camHP * 0.22;
        vec3 vp = vec3(world.x - eyeOff, world.y - eyeY, world.z);
        gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
        gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    }
}
