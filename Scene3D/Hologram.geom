#version 330 core
/**
 * @file Hologram.geom
 * @brief Geometry stage companion to Hologram.frag -- see that file's header
 * for this scene's description.
 */
// Hologram.geom -- barycentric coordinates for the wireframe, plus the
// horizontal signal glitch.
// -----------------------------------------------------------------------
// Drawing the mesh as a wireframe in one pass needs each vertex to know
// which corner of its triangle it is. With (1,0,0), (0,1,0), (0,0,1) at the
// corners the interpolated value IS the barycentric coordinate, and its
// smallest component is the distance to the nearest edge -- which is what
// Hologram.frag thresholds to draw the wire. (Same trick as Blueprint.geom,
// which documents it at length.)
//
// The glitch is done here rather than in the fragment stage on purpose: a
// real hologram dropout displaces the PROJECTED IMAGE in horizontal bands,
// so the geometry has to move. Doing it per-fragment would only smear the
// shading and leave the silhouette intact, which reads as a texture
// artefact instead of a broken projection.
// -----------------------------------------------------------------------
layout(triangles) in;
layout(triangle_strip, max_vertices = 3) out;

in  vec3  gPos[];
in  vec3  gNormal[];
in  vec2  gUV[];
in  float gBg[];

out vec2  vUV;
out vec3  vNormal;
out vec3  vPos;
out vec3  vLocalPos;
out vec3  vBary;
out float vBg;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioAdvance;
uniform float audioKick;

uniform float sizeP;
uniform float spinP;

float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

void main()
{
    // The sky shell passes through untouched -- glitching the room around
    // the projection would say the ROOM is the hologram.
    if (gBg[0] > 0.5)
    {
        for (int i = 0; i < 3; ++i)
        {
            vec3 w = gPos[i];
            vUV = vec2(0.0); vNormal = gNormal[i]; vPos = w;
            vLocalPos = vec3(0.0); vBary = vec3(1.0); vBg = 1.0;
            vec3 vp = vec3(w.x - eyeOff, w.y, w.z);
            gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
            gl_Position.x += eyeOff * 0.045 * gl_Position.w;
            // Pin the shell just inside the far plane -- its cube corners
            // otherwise reach sqrt(3) * kSkyShellRadius and get clipped,
            // punching wedges out of the room behind the projection.
            gl_Position.z = gl_Position.w * 0.999999;
            EmitVertex();
        }
        EndPrimitive();
        return;
    }

    float sz = (sizeP > 0.01 ? sizeP : 1.0);
    float sp = (spinP > 0.01 ? spinP : 1.0);

    float rotY = (time * 0.20 + audioAdvance * 0.10) * sp;
    float cy = cos(rotY), sy = sin(rotY);
    mat3 rotYMat = mat3(cy, 0.0, -sy,   0.0, 1.0, 0.0,   sy, 0.0, cy);
    const float tiltX = 0.20;
    float cx = cos(tiltX), sx = sin(tiltX);
    mat3 rotXMat = mat3(1.0, 0.0, 0.0,   0.0, cx, sx,   0.0, -sx, cx);
    mat3 rotMat = rotXMat * rotYMat;

    // One horizontal band per ~1/14 of object height. Only strong beats
    // trigger a dropout, and only some bands take part -- a glitch on every
    // beat stops reading as a fault and just becomes the animation.
    float bandId = floor((gPos[0].y + 0.5) * 14.0);
    float bandRnd = hash11(bandId * 3.7 + floor(time * 3.0) * 11.0);
    float fire = step(0.62, audioKick) * step(0.72, bandRnd);
    float slip = (bandRnd - 0.5) * 2.0 * fire * 0.09;

    vec3 bary[3] = vec3[3](vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0), vec3(0.0, 0.0, 1.0));

    for (int i = 0; i < 3; ++i)
    {
        vec3 p = gPos[i];
        p.x += slip;
        // A holotable projection has to have PRESENCE. At 30 units and 84 out
        // the object covered about a tenth of the frame -- a coloured smudge
        // on a dark floor. Size also drives brightness here, because the wire
        // is gated on how big a triangle lands on screen (see the .frag): a
        // small projection is a dim one, so the two faults had one cause.
        vec3 w = rotMat * (p * (48.0 * sz));
        w.z += 76.0;

        vUV       = gUV[i];
        vNormal   = normalize(rotMat * gNormal[i]);
        vPos      = w;
        vLocalPos = gPos[i];
        vBary     = bary[i];
        vBg       = 0.0;

        vec3 vp = vec3(w.x - eyeOff, w.y, w.z);
        gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
        gl_Position.x += eyeOff * 0.045 * gl_Position.w;
        EmitVertex();
    }
    EndPrimitive();
}
