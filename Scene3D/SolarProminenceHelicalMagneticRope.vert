#version 330 core
/**
 * @file SolarProminenceHelicalMagneticRope.vert
 * @brief Vertex stage companion to SolarProminenceHelicalMagneticRope.frag -- see that file's
 * header for this scene's description.
 *
 * SCREEN-FILL PASS: the original built ONE flux rope whose "arch" lay flat in the
 * XZ plane, so it projected to a thin horizontal thread across the middle of an
 * otherwise black frame (occ 0.08).  The arch now rises in Y as a real prominence
 * loop, and the engine's 20 ribbons are routed into a whole ACTIVE REGION:
 *   ri  0..15  four helical flux ropes (4 twisted strands each), footpoints
 *              spread along the photospheric limb in frustum coordinates so the
 *              loop field spans the full picture width
 *   ri 16..19  four coronal streamer fans rooted on the same limb, wide and dim,
 *              filling the corona above and beside the loops
 */

in vec4 attrA; // x = t [0,1], y = side (-1/+1), z = 0, w = ribbon index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out float vSide;
out float vRibbonID;
out vec3 vCol;
out float vFlarePulse;
out float vVeil;

uniform mat4 projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioChromaHue;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float archRadiusP;
uniform float ribbonWidthP;
uniform float ropeTwistP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

float hsh(float a, float b)
{
    return fract(sin(a * 71.53 + b * 39.17) * 43758.5453);
}

void main()
{
    float tCoord = attrA.x;
    float side   = attrA.y;
    float rIndex = attrA.w;

    vSide = side;
    vRibbonID = rIndex;
    vUV = vec2(tCoord, side * 0.5 + 0.5);

    // Base rate raised from 0.35: the corona's own movers are geared far down off
    // this clock (fan sway 0.23t, ripple 0.9t, camera 0.11t), so the largest part
    // of the picture crawled at under 0.1 rad/s and the scene measured static.
    // Per-activation constant coefficient on `time`, so anti-flicker safe.
    float t = time * 0.52 + audioAdvance * 0.3;

    // Frame extents at the rope's depth (55 deg vertical FOV, see
    // Scene3DShader::draw) -- everything below is laid out against these so the
    // active region covers the picture on any aspect ratio.
    const float kTanY = 0.5206;
    const float kDepth = 4.5;
    float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;
    float halfH  = kDepth * kTanY;
    float halfW  = halfH * aspect;
    float limbY  = -halfH * 1.02;              // the photospheric limb, just off-frame

    vec3  worldPos;
    float pulse = 0.0;
    float palT;

    if (rIndex < 15.5)
    {
        // ---- HELICAL MAGNETIC FLUX ROPES -----------------------------
        float g = floor(rIndex * 0.25);        // 0..3, which loop
        float k = rIndex - g * 4.0;            // 0..3, which strand of that loop
        float h1 = hsh(g, 1.7), h2 = hsh(g, 3.3), h3 = hsh(g, 5.9);

        // Footpoint slot in frustum coordinates: the four loops share the limb
        // across the whole width instead of stacking on the view axis.
        float ax = ((g + 0.5) * 0.25 - 0.5) * 2.0 * halfW * 0.78
                 + (h1 - 0.5) * halfW * 0.16;

        float rArch = (archRadiusP > 0.01 ? archRadiusP : 1.6) * (0.72 + 0.52 * h1);
        float archH = rArch * (1.55 + 0.95 * h2);
        float azOff = (h3 - 0.5) * 1.1;

        float th = tCoord * 3.14159265;        // footpoint -> apex -> footpoint
        vec3 base = vec3(ax - cos(th) * rArch, limbY + sin(th) * archH, azOff);

        // Frenet-ish frame of the loop axis; the loop lies in a plane parallel
        // to the screen, so +z is always a valid plane normal (no degenerate
        // cross product at the apex the way an up-vector frame would give).
        vec3 tang = normalize(vec3(sin(th) * rArch, cos(th) * archH, 0.0));
        vec3 nrm  = vec3(0.0, 0.0, 1.0);
        vec3 bin  = normalize(cross(tang, nrm));

        // Helical twist of the flux strands around the loop axis.
        float nTwist = (ropeTwistP > 0.01 ? ropeTwistP : 4.0);
        float strandAngle = tCoord * nTwist * 6.2831853 + k * 1.5707963
                          + g * 0.83 + t * 2.0;
        float ropeR = 0.17 * rArch * (0.80 + 0.55 * h3) * (1.0 + 0.25 * audioSwell);
        vec3  radial = bin * cos(strandAngle) + nrm * sin(strandAngle);

        vec3 centerPos = base + radial * ropeR;
        vec3 wDir = normalize(cross(tang, radial));   // ribbon tangent to the tube

        // Only a modest bump on the preset width: at this depth ribbonWidthP's
        // top end (0.1) is already a 23-pixel band on a 1080-line frame, and
        // there are sixteen strands now instead of one rope's worth.  The screen
        // fill comes from the LAYOUT and the streamer fans, not from fat ribbons.
        float width = (ribbonWidthP > 0.001 ? ribbonWidthP : 0.05)
                    * 1.15 * (1.0 + 0.3 * audioSwell);
        worldPos = centerPos + wDir * (side * width);

        // Coronal mass ejection (CME) flare reconnection burst at the apex.
        float atApex = exp(-pow(tCoord - 0.5, 2.0) * 18.0);
        pulse = atApex * (1.0 + 3.5 * audioKick);
        palT  = fract(rIndex * 0.166 + tCoord * 0.3 + audioCentroid);
        vVeil = 0.0;
    }
    else
    {
        // ---- CORONAL STREAMER FANS -----------------------------------
        // Wide, dim helmet streamers rooted on the same limb: they carry the
        // negative space of the corona instead of leaving it dead black.
        float v  = rIndex - 16.0;              // 0..3
        float hv = hsh(v, 11.3);
        float ang = (v - 1.5) * 0.86 + (hv - 0.5) * 0.14
                  + 0.17 * sin(t * 0.44 + v * 2.1);
        vec2  dir  = vec2(sin(ang), cos(ang));
        vec2  perp = vec2(cos(ang), -sin(ang));

        float L   = tCoord;                     // 0 at the limb, 1 far out
        float rad = 0.30 + L * halfH * 3.1;     // runs well past the frame edge
        float fanW = (0.20 + L * 1.20) * halfH * 0.60;
        float ripple = sin(L * 6.0 - t * 2.1 + v * 2.0) * 0.115 * rad;

        vec2 p2 = vec2(0.0, limbY - halfH * 0.06) + dir * rad
                + perp * (side * fanW + ripple);
        worldPos = vec3(p2, -1.15 - 0.25 * hv);   // behind the loops
        palT  = fract(0.35 + v * 0.11 + L * 0.18 + audioCentroid);
        vVeil = 1.0;
    }

    vFlarePulse = pulse;
    vCol = imgPalette(palT);

    // Camera Transform (V3) -- a gentle sway rather than a full turntable, so
    // the active region keeps covering the frame instead of swinging edge-on.
    vec3 vp = worldPos;
    float rot = 0.22 * sin(t * 0.11);
    float c = cos(rot), s = sin(rot);
    vp = vec3(vp.x * c - vp.z * s, vp.y, vp.x * s + vp.z * c);
    vp.z += kDepth;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
