#version 330 core
/**
 * @file GeothermalFumaroleMineralSpires.vert
 * @brief Vertex stage companion to GeothermalFumaroleMineralSpires.frag -- see that file's
 * header for this scene's description.
 *
 * The whole 220x120 grid used to collapse onto ONE cone, so the picture was a
 * single small chimney in the middle of a black frame, and nothing on it
 * actually moved.  The grid is now cut into a FIELD of spires: the u axis is
 * tiled into NS chimneys, the v axis into MS depth rows, and every chimney is
 * placed in FRUSTUM coordinates (x,y scaled by its own depth) so the field
 * stays evenly spread over the picture from the foreground out to the far
 * dark.  The bottom v band is spent on a full-frustum vent-steam curtain that
 * keeps the empty sky above the field off pure black.
 */

in vec4 attrA; // xy = global grid UV [0,1], z = 0, w = cell index
in vec4 attrB; // 4 per-cell seeds in [0,1)

out vec2 vUV;
out vec3 vNormal;
out vec3 vCol;
out float vVentGlow;
out float vBack;   // 1.0 on the far steam curtain, 0.0 on the spires
out float vFog;    // 0..1 distance haze weight

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

uniform float spireScaleP;
uniform float gasP;

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

float hsh(float a, float b, float s)
{
    return fract(sin(a * 91.73 + b * 47.31 + s) * 43758.5453);
}

void main()
{
    // The scene projection: 55 deg vertical FOV (see Scene3DShader::draw).
    const float kTanY = 0.5206;
    float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;
    // 2.0 would fit the frustum exactly; 2.3 so the field still reaches past
    // all four edges when the preset camera rig rolls and yaws the view.
    const float kOpen = 2.3;

    // Base rate raised from 0.35. Every mover here is geared DOWN off this clock
    // (curtain roll 0.25t, crust ruffle 0.7t, plume sway 0.45t), so the fastest
    // thing in the frame ran at ~0.25 rad/s and the slowest -- the curtain, which
    // covers 100% of the picture -- at 0.09 rad/s. The frame-average change was
    // therefore essentially zero (measured motion 0.0033). Per-activation
    // constant coefficient on `time`, so anti-flicker safe.
    float t = time * 0.55 + audioAdvance * 0.3;

    // Sulfide mineral / sulfur yellow / chalcopyrite palette.
    vec3 sulfurYellow = vec3(0.9, 0.75, 0.15);

    vec3 vp;

    // v below this line is spent on the far steam curtain.  15 of the 120 grid
    // rows -- the split has to land on a whole cell row or the boundary
    // triangles would stretch between the two layers.
    const float kBackV = 0.125;

    if (attrA.y < kBackV)
    {
        // ---- FAR VENT-STEAM CURTAIN ----------------------------------
        // A single full-frustum sheet of mineral haze far behind the field.
        // Dim by design: it only has to keep the sky off pure black and give
        // the receding chimneys something to fade into.
        vBack = 1.0;
        float gu = attrA.x;
        float gv = attrA.y / kBackV;

        float dz = 112.0;
        vp = vec3((gu - 0.5) * kOpen * dz * kTanY * aspect,
                  (gv - 0.5) * kOpen * dz * kTanY,
                  dz);

        vUV       = vec2(gu, gv);
        vNormal   = vec3(0.0, 0.0, 1.0);
        vVentGlow = 0.0;
        vFog      = 1.0;

        // Warm sulfurous ground haze low in the frame, cooling to almost
        // nothing at the top of the sky.
        float band = pow(clamp(1.0 - gv, 0.0, 1.0), 1.4);
        // Roll rates up (~0.25 Hz, far inside the 3 Hz full-field budget) and the
        // roll's own SWING widened: the curtain is the only layer covering the
        // whole frame, and at 0.75..1.20 of a ~0.11 base it varied by less than
        // one 1/16 luma step, so every tile it filled scored as empty. It now
        // carries both a readable level and readable internal contrast.
        float roll = 0.5 + 0.5 * sin(gu * 9.0 + t * 2.4)
                              * cos(gv * 5.0 - t * 1.7);
        vec3 haze  = palTint(mix(vec3(0.24, 0.20, 0.30),
                                 vec3(0.60, 0.37, 0.13), band),
                             gu * 0.4 + audioCentroid, 0.35);
        vCol = haze * (0.22 + 0.30 * band) * (0.55 + 0.90 * roll)
                    * (0.85 + 0.30 * audioSwell);
    }
    else
    {
        // ---- THE SPIRE FIELD -----------------------------------------
        vBack = 0.0;
        float sv = (attrA.y - kBackV) / (1.0 - kBackV);

        const float NS = 11.0;   // chimneys across the u axis (220 / 11 = 20 cells each)
        const float MS = 7.0;    // depth rows down the v axis
        float fu = attrA.x * NS;
        float ci = floor(min(fu, NS - 1e-4));
        float lu = fu - ci;                      // 0..1 around the chimney
        float fv = sv * MS;
        float ri = floor(min(fv, MS - 1e-4));
        float lv = fv - ri;                      // 0..1 base -> apex

        float h1 = hsh(ci + 1.7, ri + 0.3, 0.41);
        float h2 = hsh(ci + 0.9, ri + 2.1, 1.83);
        float h3 = hsh(ci + 3.3, ri + 1.5, 3.07);
        float h4 = hsh(ci + 2.4, ri + 4.7, 5.11);

        // Depth ladder: the rows march away from the camera, so the field has
        // a real foreground / far distance instead of one flat wall.
        float rowF = (ri + 0.5) / MS;
        float dz   = 14.0 + 68.5 * pow(rowF, 1.7) + 3.0 * (h3 - 0.5);   // was 8.5 +-2.5: the front spires filled and clipped the frame
        float halfH = dz * kTanY;
        float halfW = halfH * aspect;

        // Columns, staggered every other row so the rows never line up into
        // visible lanes.
        float colF = fract((ci + 0.5) / NS + 0.5 / NS * mod(ri, 2.0)
                           + (h1 - 0.5) * 0.6 / NS);

        // SWELL widens the chimney girth (and, with it, the precipitate
        // density read in the fragment stage).
        float sScale = (spireScaleP > 0.01 ? spireScaleP : 1.0);
        float towerH = (0.95 + 1.0 * h2) * halfH;
        float towerR = towerH * (0.10 + 0.07 * h4) * sScale
                              * (0.85 + 0.30 * audioSwell);

        float ang = lu * 6.2831853;

        // Tapered chimney with a porous mineral crust; the crust ripples
        // upward as the hydrothermal fluid ascends (advance-driven, so the
        // rate follows the music without ever remapping absolute time).
        float taper = mix(1.0, 0.16, pow(lv, 0.85));
        // Hydrothermal fluid ascending inside the crust: the ruffle now visibly
        // travels UP the chimney (the lv term dominates the phase) instead of
        // creeping at a tenth of that rate.
        float ruff  = sin(ang * 8.0 + t * 1.5) * cos(lv * 9.0 - t * 2.6) * 0.13
                    + sin(ang * 3.0 - t * 0.9) * 0.06;
        float rad   = towerR * (taper + ruff * (0.35 + 0.65 * taper));

        // Slow plume sway, strongest at the apex.
        float swayPh = h1 * 6.2831853 + t * 0.45;
        vec2  sway   = vec2(sin(swayPh), cos(swayPh * 0.73))
                     * (towerH * 0.10 * pow(lv, 2.0));

        vec3 world = vec3(rad * cos(ang) + sway.x,
                          lv * towerH    + sway.y * 0.25,
                          rad * sin(ang));

        // Base just under the bottom edge, so every chimney grows up out of
        // frame-bottom and the tops scatter over the whole picture height.
        vp = vec3((colF - 0.5) * kOpen * halfW + world.x,
                  -1.06 * halfH + world.y,
                  dz + world.z);

        // Superheated hydrothermal vent glow at the chimney apex.
        float atApex = smoothstep(0.68, 0.98, lv);
        vVentGlow = atApex * (1.0 + 3.0 * audioKick) * (gasP > 0.01 ? gasP : 1.2)
                  * (0.55 + 0.75 * h4);

        vNormal = normalize(vec3(cos(ang), 0.45 + 0.5 * (1.0 - taper), sin(ang)));
        vUV     = fract(vec2(lu + h1, lv * 0.8 + h2));
        vCol    = palTint(sulfurYellow * (0.75 + 0.5 * h4),
                          lv * 0.3 + h1 * 0.2 + audioCentroid, 0.25);
        vFog    = clamp((dz - 12.0) / 86.0, 0.0, 1.0);
    }

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
}
