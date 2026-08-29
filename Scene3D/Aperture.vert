#version 330 core
/**
 * @file Aperture.vert
 * @brief Vertex stage companion to Aperture.frag. geom="mesh"; see
 * Tools/SHADER_AUTHORING.md's `mesh` row for the attribute contract.
 *
 * The model is not lit here and its surface detail never shows -- it is used
 * purely as a SHAPE. So this stage only has to put a big, well-framed
 * silhouette on screen and keep it turning slowly enough that the outline
 * stays readable while it changes.
 */

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform int   meshVertexCount;
uniform vec3  meshExtent;
uniform vec3  meshCenter;

uniform float audioAdvance;
uniform float audioSwell;

uniform float sizeP;
uniform float spinP;

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
        vec3 p = attrA.xyz - meshCenter;

        // Two framings, picked by the model's own shape. A flat pierced panel
        // (lattice, medallion) IS a window: fill the frame with it, its in-plane
        // silhouette is the composition. A chunky model (bust, anvil, gargoyle)
        // framed that way puts the camera essentially inside the shape -- the
        // viewer sees a few enormous dark triangles and no object at all, which
        // is exactly what the frame-fill constant did to every non-flat asset.
        // Chunky models get bounding-SPHERE framing instead: normalise by the
        // extents' length (the sphere radius, rotation-proof by construction),
        // sized so the whole silhouette stays inside the 55-degree frustum at
        // z=74 (half-height 38.5) with margin. The blend runs on flatness, so
        // a model between the two archetypes gets something in between.
        float fitBox    = 0.5 / max(max(meshExtent.x, meshExtent.y), meshExtent.z);
        float fitSphere = 1.0 / max(length(meshExtent), 1e-5);
        float flat_     = min(min(meshExtent.x, meshExtent.y), meshExtent.z)
                        / max(max(meshExtent.x, meshExtent.y), meshExtent.z);
        float chunky = smoothstep(0.16, 0.30, flat_);
        float scale  = mix(96.0 * fitBox, 31.0 * fitSphere, chunky);

        // Rotation on TIME alone. audioAdvance integrates a beat-driven rate,
        // so anything it turns visibly speeds up on every kick -- measured as
        // residual beat-periodic motion (autocorr 0.46 @ 1s) after every other
        // coupling was removed. The summed coefficient keeps the average pace.
        float rotY = time * 0.16 * spinP;
        float cy = cos(rotY), sy = sin(rotY);
        mat3 spin = mat3(cy, 0.0, -sy,  0.0, 1.0, 0.0,  sy, 0.0, cy);
        const float tiltX = 0.10;
        float cx = cos(tiltX), sx = sin(tiltX);
        mat3 tilt = mat3(1.0, 0.0, 0.0,  0.0, cx, sx,  0.0, -sx, cx);
        mat3 rot = tilt * spin;

        // No swell pulse on the SIZE any more: together with the (now
        // removed) camera dolly-on-swell it read as the object wobbling
        // in time (reported twice). The beat lives in the rim flare.
        world = rot * (p * (scale * sz));
        world.z += 74.0;
        n = normalize(rot * attrB.xyz);
        vLocalPos = p;
        vBg = 0.0;
    }
    else
    {
        world = attrA.xyz;
        n = normalize(attrB.xyz);
        vLocalPos = vec3(0.0);
        vBg = 1.0;
    }

    vNormal = n;
    vPos = world;

    vec3 vp = vec3(world.x - eyeOff, world.y, world.z);
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    if( isBg ) gl_Position.z = gl_Position.w * 0.999999;
}
