#version 330 core
/**
 * @file HyperbolicPseudosphereTractroid.vert
 * @brief Vertex stage companion to HyperbolicPseudosphereTractroid.frag -- see that file's
 * header for this scene's description.
 *
 * A single tractricoid sat as one small horn in the middle of a black frame.
 * The 220 x 120 grid is now cut into a 5 x 4 block LATTICE: twenty complete
 * pseudospheres, each built from its own 44 x 30 block of cells, hung in
 * FRUSTUM coordinates (x, y scaled by depth) so the lattice covers the whole
 * picture no matter how deep each horn sits.  Blocks are selected from the
 * CELL INDEX, so every block is a closed, self-contained surface -- no quad
 * ever straddles two horns and there is nothing to taper away.
 */

in vec4 attrA; // xy = Patch UV [0,1], z = 0, w = Patch index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out vec3 vNormal;
out vec3 vCol;
out float vTractrixU;

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

uniform float pseudoScaleP;
uniform float tractrixCuspP;

// Engine grid: 220 x 120 cells (see Scene3DShader::buildGeometry, GEOM_GRID).
const float GW = 220.0, GH = 120.0;
const float NX = 5.0,  NY = 4.0;          // lattice: 5 across, 4 down
// The scene projection: 55 deg vertical FOV (see Scene3DShader::draw).
const float kTanY = 0.5206;

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
    // ---- Which horn of the lattice does this cell belong to? ----------
    // The cell index is shared by all six vertices of a cell, so the block a
    // vertex lands in never disagrees with its neighbours: every block closes
    // on itself and no triangle is stretched between two horns.
    float cell = attrA.w;
    float cx   = mod(cell, GW);
    float cy   = floor(cell / GW);
    float bw   = GW / NX;                 // 44 cells wide
    float bh   = GH / NY;                 // 30 cells tall
    float bx   = floor(cx / bw);
    float by   = floor(cy / bh);
    float inst = by * NX + bx;

    // Local patch coordinates inside the block, exactly 0..1 at its edges.
    vec2 luv = vec2((attrA.x * GW - bx * bw) / bw,
                    (attrA.y * GH - by * bh) / bh);

    vec2 uv = luv * 2.0 - 1.0;

    float t = time * 0.35 + audioAdvance * 0.3;

    // Pseudosphere / Tractricoid surface of constant negative Gaussian curvature K = -1
    // Parametrization: x = sech(u) * cos(v), y = sech(u) * sin(v), z = u - tanh(u)
    float u = uv.y * 2.2;
    float v = uv.x * 3.14159265;
    vTractrixU = u;

    float sechU = 1.0 / cosh(u);
    float tanhU = tanh(u);

    // ---- Where this horn hangs ---------------------------------------
    float jitr = fract(inst * 0.618034 + 0.27);
    float jitd = fract(inst * 0.371    + 0.11);
    float depth  = 4.2 + jitd * 5.4;                       // 4.2 .. 9.6
    float halfH  = depth * kTanY;
    float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;

    // Screen-space slot, pushed out far enough that the outer ring of horns
    // hangs half off the edge of the picture.
    float sx = ((bx + 0.5) / NX - 0.5) * 2.0 * 1.02;
    float sy = ((by + 0.5) / NY - 0.5) * 2.0 * 1.02;
    // A slow individual drift so the lattice never reads as frozen wallpaper.
    float dph = time * 0.13 + inst * 1.7;
    sx += cos(dph) * 0.055;
    sy += sin(dph * 0.81) * 0.075;

    vec3 ctr = vec3(sx * halfH * aspect, sy * halfH, depth);

    // The horn's own radius, as a fraction of the frustum half-height at its
    // depth -- so a far horn is drawn just as large on screen as a near one.
    // pseudoScaleP still varies the horns per activation, but at half weight:
    // at its 2.2 extreme a full-strength factor would swell twenty horns into
    // one solid overlapping mass.
    float pS = mix(1.0, (pseudoScaleP > 0.01 ? pseudoScaleP : 1.3) / 1.3, 0.5);
    float scale = (0.30 + 0.09 * jitr) * halfH * pS * (0.85 + 0.35 * audioSwell);

    // Asymmetric flared trumpet bells
    float cuspWarp = 1.0 + 0.12 * sin(v * 4.0 + t * 0.8 + inst)
                   * (tractrixCuspP > 0.01 ? tractrixCuspP : 1.0);

    vec3 worldPos = vec3(
        sechU * cos(v) * cuspWarp,
        sechU * sin(v) * cuspWarp,
        u - tanhU
    ) * scale;

    // Normal to Tractricoid
    vec3 nrm0 = normalize(vec3(-tanhU * cos(v), -tanhU * sin(v), sechU));

    vCol = imgPalette(fract(u * 0.2 + v * 0.159 + inst * 0.071 + audioCentroid));

    // Local UV: geodesic lines and the photo now repeat per horn rather than
    // being smeared once across the whole lattice.  Each horn takes its own
    // band of the photo, which keeps twenty identical horns from reading as a
    // print pattern.
    vUV = vec2(luv.x, clamp(luv.y * 0.55 + 0.42 * fract(inst * 0.618034), 0.0, 1.0));

    // Camera Transform (V3): each horn turns on its own axis and hangs at its
    // own tilt, then is placed at its frustum slot.
    vec3 vp = worldPos;

    float ra = t * 0.15 + inst * 0.83;
    vp = vec3(vp.x * cos(ra) - vp.z * sin(ra), vp.y, vp.x * sin(ra) + vp.z * cos(ra));
    float rb = 0.55 * sin(t * 0.11 + inst * 1.31);
    vp = vec3(vp.x, vp.y * cos(rb) - vp.z * sin(rb), vp.y * sin(rb) + vp.z * cos(rb));

    // The normal has to follow the same two turns, or the lighting detaches
    // from the surface it is shading.
    vec3 nn = nrm0;
    nn = vec3(nn.x * cos(ra) - nn.z * sin(ra), nn.y, nn.x * sin(ra) + nn.z * cos(ra));
    nn = vec3(nn.x, nn.y * cos(rb) - nn.z * sin(rb), nn.y * sin(rb) + nn.z * cos(rb));
    vNormal = normalize(nn);

    vp += ctr;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
