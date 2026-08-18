#version 330 core
// LaserArena.vert — a club laser show: 20 beams from two stage towers fan
// and sweep with the bar phase, kicks strobe them, a DROP snaps every beam
// vertical.  Each ribbon is one beam: t = distance along the beam,
// side = across the beam width.  attrA.x = t, attrA.y = side, attrA.w = beam.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioBarPhase;
uniform float audioBeatPhase;
uniform float audioKick;
uniform float audioChromaHue;
uniform float audioDrop;

out vec4  vCol;
out float vSide;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    float t    = attrA.x;                    // 0 at emitter .. 1 far end
    float side = attrA.y;
    float bi   = attrA.w;                    // beam 0..19
    float r1 = attrB.x, r2 = attrB.y;

    // Two towers left/right of the stage.
    float tower = (bi < 10.0) ? -1.0 : 1.0;
    vec3 origin = vec3(tower * 16.0, 10.0, 46.0);

    // Fan of beams sweeping with the bar; the drop points them all up.
    float fan   = ((mod(bi, 10.0) / 9.0) - 0.5) * 1.9;
    float sweep = sin(6.2831853 * audioBarPhase + r1 * 6.2831853) * 0.85;
    float yaw   = fan * (0.55 + 0.25 * sweep) - tower * 0.5;
    float pitch = -0.38 + 0.55 * sweep * (1.0 - audioDrop)
                + 1.25 * audioDrop;

    // Beams point away from the crowd, deeper into the fog (never crossing
    // the camera plane — no clipping slivers).
    vec3 dir = normalize(vec3(sin(yaw) * cos(pitch),
                              sin(pitch),
                              cos(yaw) * cos(pitch)));

    // Beam quad: a thin glowing plane along the beam.
    float len = 85.0;
    vec3 pos = origin + dir * t * len;
    vec3 sideDir = normalize(cross(dir, vec3(0.0, 0.0, 1.0)));
    pos += sideDir * side * (0.16 + 0.55 * t);   // slight cone spread

    vec3 vp = vec3(pos.x, pos.y - 2.0, pos.z);

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.06 * gl_Position.w;
    if (vp.z < 0.5)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    // Beam colour cycles per beam; kick strobe; fog fade along the beam.
    // Bounded hue spread (was a full-circle rainbow): the beams stay in
    // one laser-family, the musical key only wobbles the tint.
    vec3 col = hueRot(vec3(1.0, 0.15, 0.25),
                      mod(bi, 10.0) / 9.0 * 0.7 + sin(audioChromaHue) * 0.45);
    float strobe = 0.55 + 0.45 * sin(6.2831853 * audioBeatPhase);
    col *= (0.55 + 0.65 * strobe + 1.1 * audioKick + 1.4 * audioDrop)
         * exp(-t * 1.3) * 2.4;

    vCol  = vec4(col, 1.0);
    vSide = side;
}
