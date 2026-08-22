#version 330 core
/**
 * @file BacteriophageIcosahedralCapsidInjection.vert
 * @brief Vertex stage companion to BacteriophageIcosahedralCapsidInjection.frag -- see that file's
 * header for this scene's description.
 *
 * The whole 220x120 grid used to collapse onto ONE phage sitting in the middle
 * of a black frame, tumbling on a single slow axis.  The grid is now cut into
 * a SWARM: the u axis tiles into NS phages, the v axis into MS depth rows, and
 * every phage is placed in FRUSTUM coordinates (x,y scaled by its own depth)
 * so the swarm stays spread over the whole picture from the foreground out to
 * the far dark.  The bottom v band becomes the host cell's cytoplasm haze, so
 * the space between the phages is never pure black.
 */

in vec4 attrA; // xy = global grid UV [0,1], z = 0, w = cell index
in vec4 attrB; // 4 per-cell seeds in [0,1)

out vec2 vUV;
out vec3 vNormal;
out vec3 vCol;
out float vInjectGlow;
out float vBack;   // 1.0 on the host-cytoplasm curtain, 0.0 on the phages
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

uniform float phageScaleP;
uniform float tailContractP;

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

// House tint: bend a colour toward the photo palette while keeping its
// luminance.  The raw palette was used directly before, so a dark corner of
// the slideshow image handed the phage a near-black protein coat.
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

mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

void main()
{
    // The scene projection: 55 deg vertical FOV (see Scene3DShader::draw).
    const float kTanY = 0.5206;
    float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;
    // 2.0 would fit the frustum exactly; 2.3 so the swarm still reaches past
    // all four edges when the preset camera rig rolls and yaws the view.
    const float kOpen = 2.3;

    // Base rate raised from 0.35. Everything here is geared far DOWN off this
    // clock, and the slowest thing of all -- the cytoplasm curtain -- is the one
    // surface that covers 100% of the frame, so the frame-average motion was
    // whatever the curtain did, i.e. almost nothing (measured motion 0.0053).
    // Per-activation constant coefficient on `time`, so anti-flicker safe.
    float t = time * 0.55 + audioAdvance * 0.3;

    // Viral protein / nucleic-acid fluorescence base colour.
    vec3 proteinTeal = vec3(0.42, 0.86, 0.74);

    vec3 vp;

    // 15 of the 120 grid rows go to the host-cytoplasm curtain; the split has
    // to land on a whole cell row or the boundary triangles would stretch
    // between the two layers.
    const float kBackV = 0.125;

    if (attrA.y < kBackV)
    {
        // ---- HOST CYTOPLASM ------------------------------------------
        // A full-frustum sheet of granular cell interior far behind the
        // swarm.  Dim by design: it only keeps the gaps off pure black and
        // gives the receding phages something to fade into.
        vBack = 1.0;
        float gu = attrA.x;
        float gv = attrA.y / kBackV;

        float dz = 112.0;
        vp = vec3((gu - 0.5) * kOpen * dz * kTanY * aspect,
                  (gv - 0.5) * kOpen * dz * kTanY,
                  dz);

        vUV         = vec2(gu, gv);
        vNormal     = vec3(0.0, 0.0, 1.0);
        vInjectGlow = 0.0;
        vFog        = 1.0;

        // Slow cytoplasmic streaming; brighter toward the middle where the
        // host membrane catches the light.
        // Streaming rates up from 0.31/0.22/0.17: at the old base clock those were
        // 0.11/0.08/0.06 rad/s, i.e. a still image over a 7 s probe. At ~0.25 Hz
        // the cytoplasm visibly flows, still far under the 3 Hz full-field budget.
        float gran = 0.5 + 0.5 * sin(gu * 13.0 + t * 2.9)
                             * cos(gv * 8.0 - t * 2.1)
                   + 0.25 * sin((gu + gv) * 21.0 - t * 1.6);
        float mid  = 1.0 - 0.55 * length(vec2(gu - 0.5, gv - 0.5) * vec2(1.1, 1.6));
        // Level up from 0.13+0.16*gran: that landed the curtain at ~0.04 luma,
        // under the 1/16 step at which a tile counts as carrying content at all,
        // so the layer that covers the entire frame scored as empty black.
        vCol = palTint(mix(vec3(0.045, 0.085, 0.105), vec3(0.075, 0.150, 0.120), gran * 0.5),
                       gu * 0.4 + gv * 0.2, 0.35)
             * (0.20 + 0.32 * clamp(gran, 0.0, 1.4)) * clamp(mid, 0.35, 1.0)
             * (0.85 + 0.30 * audioSwell);
    }
    else
    {
        // ---- THE PHAGE SWARM -----------------------------------------
        vBack = 0.0;
        float sv = (attrA.y - kBackV) / (1.0 - kBackV);

        const float NS = 11.0;   // phages across the u axis (220 / 11 = 20 cells each)
        const float MS = 5.0;    // depth rows down the v axis (105 / 5 = 21 cells each)
        float fu = attrA.x * NS;
        float ci = floor(min(fu, NS - 1e-4));
        float lu = fu - ci;                      // 0..1 around the body
        float fv = sv * MS;
        float ri = floor(min(fv, MS - 1e-4));
        float lv = fv - ri;                      // 0..1 tail tip -> capsid crown

        float h1 = hsh(ci + 1.7, ri + 0.3, 0.41);
        float h2 = hsh(ci + 0.9, ri + 2.1, 1.83);
        float h3 = hsh(ci + 3.3, ri + 1.5, 3.07);
        float h4 = hsh(ci + 2.4, ri + 4.7, 5.11);

        // ---- body, exactly the original T4 construction ----
        vec2  uv = vec2(lu, lv) * 2.0 - 1.0;
        float spin = t * (0.25 + 0.35 * h4) + h1 * 6.2831853;
        float u = uv.x * 3.14159265 + spin;
        float v = uv.y * 3.14159265;

        float isHead = smoothstep(-0.2, 0.2, uv.y);
        float headR  = (0.7 + 0.15 * cos(u * 5.0) * sin(v * 5.0)) * isHead;
        float contract = (tailContractP > 0.01 ? tailContractP : 1.0) * (1.0 + 0.3 * audioKick);
        float tailR = (0.2 + 0.04 * sin(uv.y * 24.0 * contract)) * (1.0 - isHead);
        float r  = headR + tailR;
        float zH = uv.y * 1.8;
        vec3 body = vec3(r * cos(u), r * sin(u), zH);

        // Stand the body up (capsid up, baseplate down) and let each phage
        // hang at its own tilt, drifting as it hunts for the host.
        vec3 p = vec3(body.x, body.z, body.y);
        float aZ = (h1 - 0.5) * 1.5 + 0.28 * sin(t * 0.30 + h2 * 6.2831853);
        float aX = (h2 - 0.5) * 0.9 + 0.22 * sin(t * 0.23 + h3 * 6.2831853);
        p.xy = rot2(aZ) * p.xy;
        p.yz = rot2(aX) * p.yz;

        // Depth ladder + frustum placement.
        float rowF  = (ri + 0.5) / MS;
        float dz    = 7.0 + 66.0 * pow(rowF, 1.6) + 4.0 * (h3 - 0.5);
        float halfH = dz * kTanY;
        float halfW = halfH * aspect;

        float colF = fract((ci + 0.5) / NS + 0.5 / NS * mod(ri, 2.0)
                           + (h1 - 0.5) * 0.7 / NS);
        float rowY = (h2 - 0.5) * 0.85 / MS + (mod(ci, 2.0) - 0.5) * 0.35 / MS;

        // SWELL widens the capsid; the whole phage is sized against its own
        // depth so near and far ones stay comparably legible on screen.
        float scale = (phageScaleP > 0.01 ? phageScaleP : 1.2) * (0.85 + 0.35 * audioSwell)
                    * halfH * 0.135 * (0.75 + 0.5 * h4);

        // Slow drift, so no phage ever hangs perfectly still.
        vec2 bob = vec2(sin(t * 0.21 + h1 * 6.2831853),
                        cos(t * 0.17 + h4 * 6.2831853)) * (halfH * 0.05);

        vp = vec3((colF - 0.5) * kOpen * halfW + p.x * scale + bob.x,
                  ((rowF - 0.5) * 1.0 + rowY) * kOpen * halfH + p.y * scale + bob.y,
                  dz + p.z * scale);

        // DNA genome injection flash at the baseplate (bottom tip).
        float atBase = smoothstep(-0.6, -0.95, uv.y);
        vInjectGlow  = atBase * (1.0 + 3.5 * audioKick) * (0.6 + 0.8 * h4);

        vec3 n = normalize(vec3(cos(u), sin(u), isHead * 0.5));
        vec3 nn = vec3(n.x, n.z, n.y);
        nn.xy = rot2(aZ) * nn.xy;
        nn.yz = rot2(aX) * nn.yz;
        vNormal = normalize(nn);

        vUV  = fract(vec2(lu + h1, lv * 0.8 + h2));
        vCol = palTint(proteinTeal * (0.8 + 0.4 * h3),
                       fract(uv.y * 0.3 + u * 0.159 + h1 * 0.31), 0.45);
        // Depth dimming: without it the far rows stack into one teal wall.
        vCol *= 1.0 - 0.72 * rowF;
        vFog = clamp((dz - 11.0) / 80.0, 0.0, 1.0);
    }

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
    // Degenerate the boundary row: triangles spanning from the cytoplasm
    // sheet (dz 112) to the nearest phage row stretched into a full-frame
    // teal wall -- THE cyan curtain every colour fix failed to remove.
    if (abs(attrA.y - kBackV) < 0.009)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
}
