#version 330 core
/**
 * @file BoySurfaceCrossCapImmersion.vert
 * @brief Vertex stage companion to BoySurfaceCrossCapImmersion.frag -- see that file's
 * header for this scene's description.
 *
 * The 220x120 host grid is split into four independent 110x60 sub-meshes by cell
 * index: three NESTED, counter-rotating Boy-surface shells (hero / mid / outer)
 * plus one block spent on far-field dust motes distributed in FRUSTUM coordinates,
 * so the immersion fills the frame instead of floating in an empty field.
 */

in vec4 attrA; // xy = Patch UV [0,1], z = 0, w = Cell index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out vec3 vNormal;
out vec3 vCol;
out float vTriplePoint;
out float vDim;

uniform mat4 projM;
uniform float eyeOff;
uniform float time;

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

uniform float boyScaleP;
uniform float symmetryP;

// Host grid dimensions (Scene3DShader GEOM_GRID) and the shared 55-degree frustum.
const float GW = 220.0, GH = 120.0;
const float TAN_HALF_FOV = 0.52056705;
const float ASPECT_GUESS = 1.7777778;

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

void main()
{
    vec2 guv = attrA.xy;

    // --- split the host grid into four whole-cell blocks -------------------
    float cell = attrA.w;
    float cx   = mod(cell, GW);
    float cy   = floor(cell / GW);
    float bx   = step(GW * 0.5, cx);
    float by   = step(GH * 0.5, cy);
    float inst = bx + 2.0 * by;                 // 0..3

    // Local patch UV inside the block, remapped to the full [0,1] domain.
    vec2 luv = clamp((guv - vec2(bx, by) * 0.5) * 2.0, 0.0, 1.0);
    vUV = luv;

    vec2 uv = luv * 2.0 - 1.0;

    float t = time * 0.35 + audioAdvance * 0.3;

    // Polar coordinates for projective disk
    float r = length(uv) * 0.95;
    float theta = atan(uv.y, uv.x) + audioPhase * 0.2;

    // Boy's surface 3-fold symmetry immersion coordinates
    float sym = (symmetryP > 0.01 ? symmetryP : 1.0);
    float u = r * cos(theta);
    float v = r * sin(theta);

    // Parametric immersion: Bryant-Kusner / Apery equations
    float d = 1.0 + u * u + v * v;
    float x = (2.0 * (u * u - v * v) + u * (u * u + v * v) * sym) / (d * sqrt(2.0));
    float y = (2.0 * u * v - v * (u * u + v * v) * sym) / (d * sqrt(2.0));
    float zr = (u * u + v * v) / d;
    // Deeper relief than the old near-flat dish: the immersion no longer
    // collapses to a sliver when it turns away from the camera.
    float z = zr * (1.25 + 0.50 * audioSwell);

    float scale = 2.2 * (boyScaleP > 0.01 ? boyScaleP : 1.0);
    vec3 worldPos = vec3(x, y, z - 0.45) * scale;

    // Normal calculation
    vec3 n = normalize(vec3(x * 1.5, y * 1.5, zr * 2.0 - 1.0));
    vNormal = n;

    // Triple self-intersection point indicator (near origin where 3 sheets cross)
    float trip = exp(-length(worldPos) * 2.5) * (1.0 + 3.0 * audioKick);
    vTriplePoint = trip;

    vCol = imgPalette(fract(theta * 0.159 * 3.0 + r * 0.4 + audioCentroid));

    vec3 vp;

    if (inst >= 2.5)
    {
        // --- far-field dust: motes spread across the whole view frustum ----
        float s0 = attrB.x, s1 = attrB.y, s2 = attrB.z, s3 = attrB.w;
        // Depth range tracks the shells' own scale, so the motes stay spread
        // through the volume the immersion occupies at any boyScaleP.
        float dz = 2.2 + scale * (0.5 + 4.6 * s0);
        float hx = TAN_HALF_FOV * ASPECT_GUESS * dz;
        float hy = TAN_HALF_FOV * dz;
        float dph = audioAdvance * 0.05 + audioPhase * 0.15;
        float px = (s1 * 2.0 - 1.0) + 0.06 * sin(dph + s3 * 6.2831853);
        float py = (s2 * 2.0 - 1.0) + 0.06 * cos(dph * 0.83 + s1 * 6.2831853);
        // 1.0 fits the frustum exactly; 1.15 keeps the field past all four
        // edges while the preset camera rig rolls, yaws and pitches.
        vec3 c = vec3(px * hx * 1.15, py * hy * 1.15, dz);

        // Cell-local corner in {-1,+1}^2 -> a camera-facing mote quad.
        vec2 cq = clamp(guv * vec2(GW, GH) - vec2(cx, cy), 0.0, 1.0) * 2.0 - 1.0;
        float msz = 0.0045 * dz * (0.6 + 0.7 * s3) * (1.0 + 0.6 * audioKick);

        vp = c + vec3(cq * msz, 0.0);
        vNormal = normalize(vec3(0.28, 0.36, 0.89));
        vTriplePoint = 0.0;
        vDim = 0.22 + 0.22 * s3;
    }
    else
    {
        // --- three nested, counter-rotating immersion shells ---------------
        // Each shell's camera distance is a MULTIPLE of its own size, so the
        // composition (hero at ~61% of the frame height, mid at ~80%, outer
        // filling it) holds for every boyScaleP, and no shell can swing part of
        // itself behind the lens the way a fixed 4.8 did at the preset maximum.
        float shellScale = (inst < 0.5) ? 1.00 : ((inst < 1.5) ? 1.70 : 2.60);
        float shellDist  = (inst < 0.5) ? 2.85 : ((inst < 1.5) ? 2.15 : 1.85);
        float shellSpin  = (inst < 0.5) ? 1.00 : ((inst < 1.5) ? -0.62 : 0.33);
        vDim             = (inst < 0.5) ? 1.00 : ((inst < 1.5) ? 0.62 : 0.36);
        float shellZ     = shellDist * scale * shellScale;

        float a = t * 0.25 * shellSpin;

        // Bounded pitch/yaw (never a full edge-on quarter turn) plus a free
        // roll about the view axis, so every shell stays broad on screen.
        float pit = 0.55 * sin(a * 0.41 + 1.3);
        float yaw = 1.00 * sin(a * 0.55);
        float rol = a;

        vec3 p = worldPos * shellScale;
        float cp = cos(pit), sp = sin(pit);
        p = vec3(p.x, p.y * cp - p.z * sp, p.y * sp + p.z * cp);
        float cyw = cos(yaw), syw = sin(yaw);
        p = vec3(p.x * cyw + p.z * syw, p.y, -p.x * syw + p.z * cyw);
        float cr = cos(rol), sr = sin(rol);
        p = vec3(p.x * cr - p.y * sr, p.x * sr + p.y * cr, p.z);
        p.z += shellZ;
        vp = p;
    }

    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
