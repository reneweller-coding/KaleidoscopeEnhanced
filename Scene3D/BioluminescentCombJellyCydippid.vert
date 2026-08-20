#version 330 core
/**
 * @file BioluminescentCombJellyCydippid.vert
 * @brief Vertex stage companion to BioluminescentCombJellyCydippid.frag -- see that file's
 * header for this scene's description.
 *
 * A single cydippid sat as one small oval in the middle of a black frame.  The
 * 300 segments of every ribbon are now split into SIX runs: five of them draw
 * one meridional ctene row on each of five drifting jellies, spread over the
 * frustum so the bloom reaches all four corners, and the sixth draws the long
 * trailing tentacle each ribbon streams from its jelly, out past the picture
 * edge.  Every jelly still carries all twenty comb rows.
 *
 * Because each ribbon segment is its own pair of triangles, the runs can jump
 * between jellies freely -- the one quad that straddles a boundary is pinched
 * to zero width and zero brightness by the pole taper (which is also how a
 * real ctene row ends, short of the poles), so no strand is ever drawn across
 * the gap.
 */

in vec4 attrA; // x = t [0,1], y = side (-1/+1), z = 0, w = ribbon index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out float vSide;
out float vRibbonID;
out vec3 vCol;
out float vCiliaWave;

uniform mat4 projM;
uniform float eyeOff;
uniform float time;
uniform vec2 resolution;

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

uniform float bodyScaleP;
uniform float ribbonWidthP;
uniform float beatSpeedP;

// The scene projection: 55 deg vertical FOV (see Scene3DShader::draw).
const float kTanY = 0.5206;
const float kJelly = 5.0;   // jellies in the bloom (runs 0..4; run 5 = tentacles)

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

vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
}

// Where jelly `gi` hangs, and how big it is.  Placed in FRUSTUM coordinates
// (x,y scaled by depth) so the bloom stays evenly spread across the picture
// however deep each animal sits -- the fix for the classic "dense in the
// middle, empty at the edges" look.  Returns the body half-radius as bScale.
void jellyRig(float gi, float aspect, out vec3 ctr, out float bScale)
{
    float jz   = 3.8 + fract(gi * 0.371 + 0.19) * 8.4;   // depth 3.8 .. 12.2
    float half = jz * kTanY;                             // frustum half-height there

    // Stratified across x, golden-ratio scattered up the y axis, so five
    // animals cannot clump into one corner.
    float sx = (gi + 0.5) / kJelly;
    float sy = fract(gi * 0.618034 + 0.31);
    vec2  sxy = vec2(sx - 0.5, sy - 0.5) * 1.74;

    // Each animal sculls along its own slow loop.
    float ph = time * 0.11 + gi * 2.4;
    sxy += vec2(cos(ph), sin(ph * 0.83)) * 0.085;

    ctr    = vec3(sxy.x * half * aspect, sxy.y * half, jz);
    bScale = (0.30 + 0.17 * fract(gi * 0.727 + 0.55)) * half / 0.95;
}

void main()
{
    float tCoord = attrA.x;
    float side   = attrA.y;
    float rIndex = attrA.w;

    vSide = side;
    vRibbonID = rIndex;

    float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;

    float t = time * 0.35 + audioAdvance * 0.3;

    // Which run of the ribbon this vertex belongs to, and where along it.
    float g = min(floor(tCoord * 6.0), 5.0);
    float u = clamp(tCoord * 6.0 - g, 0.0, 1.0);

    // Ctene rows stop short of both poles; the taper is exactly zero at the
    // run's ends, which also pinches away the quad that bridges two runs.
    float taper = smoothstep(0.02, 0.16, u) * (1.0 - smoothstep(0.84, 0.98, u));

    // bodyScaleP keeps behaving as a multiplier around its 1.2 default.
    float bp = (bodyScaleP > 0.01 ? bodyScaleP : 1.2) / 1.2;
    float wBase = (ribbonWidthP > 0.001 ? ribbonWidthP : 0.055)
                * (1.0 + 0.3 * audioSwell);

    vUV = vec2(u, side * 0.5 + 0.5);

    vec3 worldPos;
    vec3 iridCol = vec3(0.2, 0.85, 0.95);
    float huePos;

    if (g < 4.5)
    {
        // ---- One meridional comb row on jelly `g` ---------------------
        vec3 ctr; float bScale;
        jellyRig(g, aspect, ctr, bScale);
        bScale *= bp;

        float cteneAngle = rIndex * 0.31415927; // 20 ctene rows

        // Meridional ellipse profile from oral to aboral pole
        float theta = (u - 0.5) * 3.14159265;
        float rBody = cos(theta) * 0.95 * bScale;
        float zBody = sin(theta) * 1.6 * bScale;

        // Hydrodynamic swimming pulsation
        rBody += sin(t * 1.5 + g * 1.9) * 0.07 * bScale;

        vec3 centerPos = vec3(cos(cteneAngle) * rBody,
                              sin(cteneAngle) * rBody,
                              zBody);

        vec3 tangent  = normalize(vec3(-cos(cteneAngle) * sin(theta),
                                       -sin(cteneAngle) * sin(theta),
                                        cos(theta)));
        vec3 binormal = normalize(cross(tangent,
                                        vec3(cos(cteneAngle), sin(cteneAngle), 0.0)));

        float width = wBase * (bScale / 1.2) * taper;
        vec3 lp = centerPos + binormal * (side * width);

        // Each animal turns on its own axis and hangs at its own tilt.
        float ra = t * 0.15 + g * 1.27;
        lp = vec3(lp.x * cos(ra) - lp.z * sin(ra), lp.y, lp.x * sin(ra) + lp.z * cos(ra));
        float rb = 0.35 * sin(t * 0.09 + g * 2.1);
        lp = vec3(lp.x, lp.y * cos(rb) - lp.z * sin(rb), lp.y * sin(rb) + lp.z * cos(rb));

        worldPos = ctr + lp;

        // Metachronal ciliary comb plate beating waves
        float vBeat = (beatSpeedP > 0.01 ? beatSpeedP : 2.5);
        float cilia = sin(u * 28.0 - t * vBeat + rIndex * 0.4 + g * 1.1);
        vCiliaWave = pow(cilia * 0.5 + 0.5, 3.0) * (1.0 + 3.0 * audioKick) * taper;

        huePos = fract(u * 0.4 + rIndex * 0.125 + g * 0.13 + audioCentroid);
    }
    else
    {
        // ---- The trailing tentacle ------------------------------------
        // A cydippid streams two long, sticky tentacles behind it; four
        // strands per animal here, drifting out well past the frame edge.
        // These are what carry the empty water between the jellies.
        float jIdx = floor(mod(rIndex, kJelly));
        vec3 ctr; float bScale;
        jellyRig(jIdx, aspect, ctr, bScale);

        float seed = fract(rIndex * 0.61803398 + jIdx * 0.317);

        // Trailing mostly downward and behind, fanned out either side.
        float ang0 = -1.5707963 + (seed - 0.5) * 2.6;
        vec2  dir  = vec2(cos(ang0), sin(ang0));
        vec2  nrm  = vec2(-dir.y, dir.x);

        // Long enough to leave the picture from wherever the animal hangs.
        float L   = 1.75 * ctr.z * kTanY;
        float cph = time * 0.25 + rIndex * 0.9 + audioAdvance * 0.2;
        float curl = sin(u * 6.5 + cph) * 0.26 * u
                   + sin(u * 2.1 - cph * 0.6) * 0.12 * u;

        vec2 off = dir * (u * L) + nrm * (curl * L);
        // Hair-thin, and thinning further towards the tip.
        float width = wBase * (bScale / 1.2) * 0.42 * taper * (1.0 - 0.55 * u);

        worldPos = ctr + vec3(off.x + nrm.x * side * width,
                              off.y + nrm.y * side * width,
                              0.35 * bScale * sin(u * 3.0 + cph * 0.4));

        // Tentilla: the fine side-branches read as a bead pattern of light.
        float tentilla = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(u * 90.0 + rIndex * 2.3), 2.0);
        vCiliaWave = tentilla * 0.22 * (1.0 + 1.6 * audioKick) * taper * (1.0 - 0.4 * u);

        huePos = fract(u * 0.25 + rIndex * 0.125 + audioCentroid);
        iridCol = vec3(0.18, 0.62, 0.90);
    }

    // Translucent comb plate diffraction iridescence
    vCol = palTint(iridCol, huePos, 0.28) * taper;

    // Camera Transform (V3) -- the rig above already works in view space.
    vec3 vp = worldPos;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
