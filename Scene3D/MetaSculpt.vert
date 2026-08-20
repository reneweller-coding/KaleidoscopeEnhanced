#version 330 core
/**
 * @file MetaSculpt.vert
 * @brief Vertex stage companion to MetaSculpt.frag -- see that file's header for
 * this scene's description.
 */
// MetaSculpt.vert — the vertices arrive straight from MetaSculpt.comp, so
// there is nothing to generate here: place the body and pass the shading data.

in vec4 attrA;      // xyz = object position, w = field strength at that point
in vec4 attrB;      // xyz = surface normal (from the field gradient), w = kind

out vec3  vObj;
out vec3  vNormal;
out vec3  vView;
out vec3  vWorld;
out float vStrength;
out float vKind;

uniform mat4  projM;
uniform mat4  lightM;
uniform float shadowPass;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;
uniform float audioAdvance;
uniform float audioLevel;

uniform float camDistP;

void main()
{
    vec3 p = attrA.xyz;
    vec3 n = attrB.xyz;
    vKind = attrB.w;

    if (vKind > 0.5)
    {
        // FAR-FIELD BACKDROP (MetaSculpt.comp::emitBackdrop): already in view
        // space, and deliberately NOT tumbled with the body -- a backdrop that
        // rotated with the sculpture would read as a second spinning object.
        vObj      = vec3(n.xy, 0.0);            // panel u/v
        vNormal   = vec3(0.0, 0.0, 1.0);
        vView     = vec3(0.0, 0.0, 1.0);
        vWorld    = p;
        vStrength = 0.0;
        if (shadowPass > 0.5)
        {
            // Never a shadow caster: it sits 15 units back, far outside the
            // light box, and would otherwise smear the whole map.
            gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
            return;
        }
        float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;
        vec3 vp = vec3(p.x * (aspect / 1.7778) - eyeOff, p.y, p.z);
        gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
        gl_Position.x += eyeOff * 0.045 * gl_Position.w;
        return;
    }

    // Slow tumble, so the silhouette keeps presenting new lobes.  The constant
    // * time terms keep it turning through a quiet passage; the audio-driven
    // part rides the pre-integrated accumulator, never audio * time.
    // Base rates raised from 0.045 / 0.030: an 18-degree turn over a whole probe
    // is not a tumble, and the silhouette never got round to presenting a new
    // lobe. 0.16 rad/s is still a slow, stately roll (0.025 Hz).
    float ya = time * 0.160 + audioAdvance * 0.10;
    float pa = 0.28 * sin(time * 0.105 + audioAdvance * 0.06);
    mat3 yaw   = mat3(cos(ya), 0.0, -sin(ya), 0.0, 1.0, 0.0, sin(ya), 0.0, cos(ya));
    mat3 pitch = mat3(1.0, 0.0, 0.0, 0.0, cos(pa), sin(pa), 0.0, -sin(pa), cos(pa));
    mat3 rot = yaw * pitch;

    vec3 pw = rot * p;
    // +0.8: the body's field domain grew from +-1.65 to +-2.70, so on a loud
    // bar with a wide spread the surface can reach ~3.5 units from the origin
    // -- past the camera at the old 3.23-unit minimum distance.
    float dist = camDistP * (1.0 - 0.05 * audioLevel) + 0.8;
    vec3 vp = vec3(pw.x - eyeOff, pw.y, pw.z + dist);

    vObj      = p;
    vNormal   = rot * n;
    vView     = normalize(-vp);
    vWorld    = pw;
    vStrength = attrA.w;

    // The shadow contract on the indirect path.  The generator has already run
    // once this frame (the engine skips it on the second pass), so both passes
    // draw the same mesh — which is exactly what a shadow map must be able to
    // assume.
    if (shadowPass > 0.5)
    {
        gl_Position = lightM * vec4(pw, 1.0);
    }
    else
    {
        gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
        gl_Position.x += eyeOff * 0.045 * gl_Position.w;
        // Belt and braces: a vertex at or behind the eye has w <= 0 and would
        // smear a wedge of garbage across the frame instead of being clipped.
        if (vp.z < 0.45)
            gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
    }
}
