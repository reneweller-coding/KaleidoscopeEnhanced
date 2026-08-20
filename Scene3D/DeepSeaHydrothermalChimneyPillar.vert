#version 330 core
/**
 * @file DeepSeaHydrothermalChimneyPillar.vert
 * @brief Vertex stage companion to DeepSeaHydrothermalChimneyPillar.frag -- see that file's
 * header for this scene's description.
 *
 * The 220 x 120 grid is cut into bands by CELL INDEX (never by the raw vertex
 * uv, which is shared across a cell boundary and would tear the mesh):
 *   v band 0            -> one continuous 220 x 30 sheet used as the abyssal
 *                          water column behind everything
 *   v bands 1..3, u x 5 -> 15 independent chimneys, three depth layers of five
 *
 * A single chimney was one thin vertical bar in the middle of a black frame
 * (occ 0.16).  The chimneys are now placed in FRUSTUM coordinates -- lateral
 * offset and tower size both scale with depth -- so the vent field stays evenly
 * spread across the picture however far back a layer sits.
 */

in vec4 attrA; // xy = grid UV [0,1], z = 0, w = cell index (220 x 120 cells)
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out vec3 vNormal;
out vec3 vCol;
out float vSmokerGlow;
out float vBack;

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

uniform float pillarScaleP;
uniform float ventGlowP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    col = mix(vec3(g), col, 0.55 + 0.45 * audioValence);
    // LUMINANCE-NORMALISED.  Every surface in this scene is this palette times
    // a shading term, so whenever the sampling arc lands on a dark patch of the
    // slideshow photo the whole vent field and the whole water column go black
    // together and the only thing left in the picture is the orange smoker
    // plume -- a small motif on a dead field, which is precisely what the
    // occupancy scan was reporting.  Hue and saturation stay the photo's; only
    // the LEVEL is pinned, so the scene can no longer be dark by accident.
    // The lift is capped, and a big lift is walked back toward the colour's own
    // grey: multiplying a dark, strongly tinted photo pixel up is exactly how a
    // photo palette turns into a candy wash.
    float pl = max(dot(col, vec3(0.2126, 0.7152, 0.0722)), 0.05);
    float k  = clamp(0.30 / pl, 0.25, 3.5);
    col = clamp(col * k, 0.0, 1.4);
    return mix(col, vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))),
               clamp((k - 1.4) * 0.35, 0.0, 0.5));
}

float hsh(float a, float b)
{
    return fract(sin(a * 91.73 + b * 47.31) * 43758.5453);
}

void main()
{
    // The scene projection: 55 deg vertical FOV (see Scene3DShader::draw).
    const float kTanY = 0.5206;
    const float GW = 220.0, GH = 120.0;   // the grid the engine hands us
    const float NC = 5.0;                 // chimneys across the u domain
    const float NR = 4.0;                 // v bands: 0 = backdrop, 1..3 = layers
    float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;

    float cell    = attrA.w;
    float cx      = mod(cell, GW);
    float cyi     = floor(cell / GW);
    float colsPer = GW / NC;              // 44 cells per chimney
    float rowsPer = GH / NR;              // 30 cells per band
    float iCol    = floor(cx  / colsPer);
    float iRow    = floor(cyi / rowsPer);
    // Band-local uv, continuous inside a cell because the band index comes from
    // the cell and never from the vertex's own uv.
    float uLoc = (attrA.x * GW - iCol * colsPer) / colsPer;
    float vLoc = (attrA.y * GH - iRow * rowsPer) / rowsPer;

    vec3  vp;
    float t = time * 0.35 + audioAdvance * 0.3;

    if (iRow < 0.5)
    {
        // ---- ABYSSAL WATER COLUMN ------------------------------------
        // One sheet far behind the field, placed in frustum coordinates so it
        // reaches past every edge (2.0 would fit exactly; the preset camera rig
        // rolls and yaws the view, so it is opened further).
        float dz   = 62.0;
        float open = 2.6;
        float sx   = attrA.x - 0.5;
        float sy   = vLoc    - 0.5;
        // A slow swell, so the sheet reads as water and not as a flat card.
        float swell = 2.0 * sin(attrA.x * 7.0 + time * 0.90 + audioAdvance * 0.05)
                          * cos(vLoc * 5.0 - time * 0.65);

        vp = vec3(sx * open * dz * kTanY * aspect,
                  sy * open * dz * kTanY,
                  dz + swell);

        // Near-black cold water up in the column, a trace of warm mineral silt
        // down where the vent field lies.  Smooth trig mottle rather than a
        // per-cell hash: a cell of this sheet is ~90 px tall and any per-cell
        // value would show up as a visible block.
        vec3 deep = imgPalette(fract(attrA.x * 0.21 + vLoc * 0.13 + audioCentroid * 0.5));
        deep = mix(vec3(dot(deep, vec3(0.333))), deep, 0.40);
        // Mottle rates up from 0.07 / 0.05: this sheet covers the ENTIRE frame,
        // so whatever it does is what the frame-average motion measures -- and at
        // 0.06 rad/s it did nothing at all (measured motion 0.0036). ~0.24 Hz
        // reads as moving water and is far inside the 3 Hz full-field budget.
        // TWO octaves.  The coarse one alone has a feature about a third of the
        // frame wide -- three tiles -- so a tile-sized patch of the column was
        // uniform, and a uniform patch is an EMPTY patch to the occupancy scan
        // however bright it is.  The fine octave runs ~32 cycles across the
        // visible width (about a third of a tile, ~60 px at 1080p, so it
        // survives the frame downscale) at 0.14-0.21 Hz.
        float mottle = 0.5
                     + 0.34 * sin(attrA.x * 9.3 + vLoc * 5.1 + time * 1.50)
                            * cos(attrA.x * 4.1 - vLoc * 7.7 - time * 1.10)
                     + 0.16 * sin(attrA.x * 41.0 - vLoc * 23.0 + time * 0.90)
                            * cos(attrA.x * 17.0 + vLoc * 37.0 - time * 1.30);
        // Water level lifted: at 0.03..0.08 the curtain sat under the threshold
        // at which a tile registers as carrying content, so the layer that fills
        // the whole picture scored as empty black.
        vec3 water = mix(vec3(0.052, 0.088, 0.138),
                         vec3(0.115, 0.096, 0.076),
                         smoothstep(0.10, 0.92, vLoc));

        // Widened from 0.42..1.47 to 0.30..1.75: the column now swings roughly
        // 0.025..0.15 in luma, i.e. more than the two quantisation buckets a
        // pixel has to clear to count as content at all.
        vCol        = water * (0.30 + 1.45 * mottle) * (0.55 + 0.85 * deep)
                    * (0.85 + 0.30 * audioSwell);
        vNormal     = vec3(0.0, 0.0, 1.0);
        vSmokerGlow = 0.0;
        vBack       = 1.0;
        vUV         = vec2(attrA.x, vLoc);
    }
    else
    {
        // ---- THE VENT FIELD ------------------------------------------
        float id = (iRow - 1.0) * NC + iCol;                 // 0..14
        float h1 = hsh(id, 1.7);
        float h2 = hsh(id, 3.3);
        float h3 = hsh(id, 5.9);
        float h4 = hsh(id, 8.1);

        float layer  = (iRow - 1.0) / (NR - 2.0);            // 0, 0.5, 1
        float dz     = mix(7.0, 30.0, layer) * (0.85 + 0.30 * h3);
        float halfH  = dz * kTanY;
        float halfW  = halfH * aspect;

        // FRUSTUM-COORDINATE placement: lateral slot and tower size both scale
        // with depth, so all three layers cover the frame equally.
        float open = 2.2;
        float lat  = (iCol + 0.5) / NC - 0.5
                   + (h1 - 0.5) * 0.16
                   + (iRow - 2.0) * 0.062;
        float ox   = lat * open * halfW;

        float scale = (pillarScaleP > 0.01 ? pillarScaleP : 1.2) * (0.90 + 0.22 * audioSwell);

        float u = uLoc * 6.2831853;
        float v = vLoc * 3.14159265;

        float rad = halfH * 0.150 * (0.70 + 0.60 * h2) * scale;
        float hgt = halfH * (1.35 + 0.75 * h4) * scale;

        float up    = 1.0 - vLoc;                 // 0 at the sea floor, 1 at the summit
        float taper = 0.42 + 0.58 * pow(clamp(1.0 - up, 0.0, 1.0), 0.65);
        float crust = 1.0 + 0.30 * cos(u * 5.0) * sin(v * 4.0)
                          + 0.14 * sin(u * 11.0 + up * 9.0);
        float towerR = rad * max(taper * crust, 0.10);

        // The chimney leans and sways; the sway rides absolute time only, the
        // vent's fluid ascent rides the pre-integrated advance.
        float baseY = -halfH * (0.66 + 0.16 * h2);
        float la    = h4 * 6.2831853;
        float lean  = (0.09 + 0.10 * h1) * hgt * up;
        float sway  = sin(time * 0.25 + h1 * 6.2831853) * 0.035 * hgt * up;

        vp = vec3(ox + towerR * cos(u) + cos(la) * lean + sway,
                  baseY + up * hgt,
                  dz + towerR * sin(u) + sin(la) * lean);

        // Superheated black-smoker fluid erupts from the summit, which is at
        // vLoc = 0 (the tower is built from the floor upward).
        float atApex = smoothstep(0.32, 0.03, vLoc);
        vSmokerGlow  = atApex * (1.0 + 3.5 * audioKick)
                     * (ventGlowP > 0.01 ? ventGlowP : 1.3);

        vNormal = normalize(vec3(cos(u), 0.35, sin(u)));

        vCol = imgPalette(fract(vLoc * 0.3 + uLoc + audioCentroid + t * 0.01));
        // Water fog: the far layer sinks toward the colour of the column
        // instead of staying as bright as the near one.
        vCol *= clamp(1.0 - dz / 74.0, 0.34, 1.0);

        vBack = 0.0;
        vUV   = vec2(uLoc, vLoc);
    }

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
