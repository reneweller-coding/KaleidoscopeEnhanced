#version 330 core
/**
 * @file VideoRelief.vert
 * @brief Vertex stage companion to VideoRelief.frag -- see that file's header for
 * this scene's description.
 */
// VideoRelief.vert — the picture as terrain.
// -----------------------------------------------------------------------
// The image source (a photograph, a Spout feed, or a decoded video with -v) is
// read in the VERTEX shader and its luminance becomes height.  That is the whole
// idea, and it turns a flat frame into something the light can rake across.
//
// The normal is the part that decides whether it works.  Taking the height at
// the vertex and calling the surface flat gives a lit plane with a texture on
// it; the relief only appears once the normal follows the slope.  So four extra
// taps, central differences, and the cross product of the two tangents.  The
// step has to be a real texel or two — smaller and the difference is quantised
// into steps by the texture's own 8-bit levels, and the surface comes out
// faceted into terraces.
// -----------------------------------------------------------------------

in vec4 attrA;      // xy = u/v across the sheet, w = cell index
in vec4 attrB;      // per-cell hashes

out vec2  vUv;
out vec3  vNormal;
out vec3  vView;
out float vHeight;

uniform sampler2D tex0;
uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform float audioAdvance;
uniform float audioLevel;
uniform float audioKick;
uniform float audioSubBass;

uniform float reliefP;      // preset: height of the relief
uniform float scrollP;      // preset: how fast the sheet drifts
uniform float camDistP;
uniform float tiltP;

float lum(vec2 uv)
{
    return dot(texture(tex0, clamp(uv, vec2(0.001), vec2(0.999))).rgb,
               vec3(0.299, 0.587, 0.114));
}

void main()
{
    vec2 uv = attrA.xy;

    // A slow pan across the source, so a still photograph still moves.
    vec2 pan = vec2(audioAdvance * 0.012 * clamp(scrollP, 0.0, 2.0), 0.0);
    vec2 suv = fract(uv + pan);

    float h = lum(suv);
    // Bass lifts the whole sheet, the kick punches it: the relief breathes with
    // the low end rather than only with the picture.
    float amp = clamp(reliefP, 0.0, 3.0) * (0.55 + 0.55 * audioSubBass + 0.5 * audioKick);
    float y = (h - 0.45) * amp;

    // Two texels, not one: an 8-bit source quantises smaller differences into
    // terraces and the relief comes out stepped.
    vec2 e = vec2(2.0 / 1024.0, 0.0);
    float hx = lum(suv + e.xy) - lum(suv - e.xy);
    float hy = lum(suv + e.yx) - lum(suv - e.yx);

    // The sheet is 10 x 6 world units, so a unit of uv is 10 (or 6) units of x
    // (or z) — the tangents have to carry that or the normal is wrong by the
    // aspect ratio.
    vec3 tx = vec3(10.0 * 2.0 * e.x, hx * amp, 0.0);
    vec3 tz = vec3(0.0, hy * amp, 6.0 * 2.0 * e.x);
    vec3 n = normalize(cross(tz, tx));
    if (n.y < 0.0) n = -n;

    vec3 p = vec3((uv.x - 0.5) * 10.0, y, (uv.y - 0.5) * 6.0);

    float ta = clamp(tiltP, 0.0, 1.4);
    mat3 tilt = mat3(1.0, 0.0, 0.0,
                     0.0, cos(ta), sin(ta),
                     0.0, -sin(ta), cos(ta));
    float ya = 0.22 * sin(audioAdvance * 0.03);
    mat3 yaw = mat3(cos(ya), 0.0, -sin(ya), 0.0, 1.0, 0.0, sin(ya), 0.0, cos(ya));
    mat3 rot = yaw * tilt;

    vec3 pw = rot * p;
    float dist = camDistP * (1.0 - 0.04 * audioLevel);
    vec3 vp = vec3(pw.x - eyeOff, pw.y, pw.z + dist);

    vUv     = suv;
    vNormal = rot * n;
    vView   = normalize(-vp);
    vHeight = h;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
