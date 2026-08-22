#version 330 core
out vec4 fragColor;
/**
 * @file BismuthHyperLabyrinth.frag
 * @brief BISMUTH HYPER LABYRINTH: Raymarched infinite 3D/4D hopper crystal maze
 * of elemental bismuth with stepped 90-degree concentric square terraces,
 * thin-film optical interference oxidation iridescence, metallic specular
 * reflections, holographic audio equalizer pulses, and photo texturing.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;
uniform float audioChromaHue;

uniform float zoomP;
uniform float stepP;
uniform float speedP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}


// IMG-PALETTE (house standard): colours come from a rotating arc in the
// CURRENT slideshow image, so every activation inherits a fresh palette from
// the photos; the arc follows the musical key (audioChromaHue is circular-
// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

// Thin-film interference optical spectrum
vec3 thinFilmColor(float thickness) {
    // Iridescent banding from arc positions in the photo (house standard)
    // instead of the full HSV wheel.
    return imgPalette(thickness * 1.5) * 1.35;
}

// Bismuth hopper crystal distance function
float mapBismuth(vec3 p, out vec3 outUVW, float stepScale) {
    vec3 z = p;
    float scale = 1.0;

    // Repetition & domain folding
    z = mod(z + 2.0, 4.0) - 2.0;

    for (int i = 0; i < 4; ++i) {
        z = abs(z);
        if (z.x < z.y) z.xy = z.yx;
        if (z.x < z.z) z.xz = z.zx;
        if (z.y < z.z) z.yz = z.zy;

        // Concentric 90-degree stepped terraces
        z.x -= 0.65 * stepScale;
        z.y -= 0.45 * stepScale;

        float s = 1.6 + 0.2 * sin(audioAdvance * 0.1);
        z *= s;
        scale *= s;
    }

    outUVW = z / scale;
    // Box frame distance
    vec3 d = abs(z) - vec3(0.6, 0.6, 0.6);
    float box = min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0));
    return box / scale;
}

vec3 calcNormal(vec3 p, float stepScale) {
    vec2 e = vec2(0.002, 0.0);
    vec3 dummy;
    return normalize(vec3(
        mapBismuth(p + e.xyy, dummy, stepScale) - mapBismuth(p - e.xyy, dummy, stepScale),
        mapBismuth(p + e.yxy, dummy, stepScale) - mapBismuth(p - e.yxy, dummy, stepScale),
        mapBismuth(p + e.yyx, dummy, stepScale) - mapBismuth(p - e.yyx, dummy, stepScale)
    ));
}

void main() {
    float zm  = (zoomP  > 0.0) ? zoomP  : 1.0;
    float stp = (stepP  > 0.0) ? stepP  : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // Smooth forward camera flight through crystal corridors.  The old path
    // oscillated AROUND the origin (+-1.5/1.2), but a numeric probe of
    // mapBismuth() along that path found it inside solid rock ~82% of the
    // time -- the open channel through this IFS actually sits off-centre,
    // around (1.7, 1.7).  Re-centring the wander there (and slowing it down)
    // keeps the camera clear for the shader's whole stepP/audioBass range,
    // bar the rare graze at stepP's extreme high end.
    float t = time * 0.18 * spd + audioAdvance * 0.09;
    vec3 ro = vec3(1.7 + cos(t * 0.4) * 0.3, 1.7 + sin(t * 0.3) * 0.24, t * 2.0);
    vec3 ta = ro + vec3(sin(t * 0.4 + 0.3), cos(t * 0.3 + 0.2), 2.0);
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.2 * zm * ww);

    // If a preset/extreme stepP still leaves the start point inside
    // rock, walk the camera forward along its axis until it is free.
    {
        vec3 esc;
        for (int e = 0; e < 8; ++e) {
            if (mapBismuth(ro, esc, stp) > 0.05) break;
            ro += vec3(0.0, 0.0, 0.35);
        }
    }
    float totalDist = 0.0;
    float minDist = 1000.0;
    vec3 hitUVW = vec3(0.0);
    int hitSteps = 0;
    // The 0.15*audioBass breathing moved the WALLS of the labyrinth;
    // a numeric probe showed the open channel closing over the camera on
    // bass swells (the recording's flat-grey frame is the inside of a
    // terrace).  The music now drives light and colour, never the walls.
    float stepScale = stp;

    for (int i = 0; i < 80; ++i) {
        vec3 p = ro + rd * totalDist;
        vec3 uvw;
        float d = mapBismuth(p, uvw, stepScale);
        minDist = min(minDist, d);
        if (d < 0.003 || totalDist > 20.0) {
            hitUVW = uvw;
            hitSteps = i;
            break;
        }
        totalDist += d * 0.75;
    }

    vec3 col = vec3(0.0);

    if (totalDist < 20.0) {
        vec3 p = ro + rd * totalDist;
        vec3 n = calcNormal(p, stepScale);
        vec3 lightDir = normalize(vec3(0.6, 0.8, -0.5));

        // Metallic specular & Fresnel
        float diff = max(dot(n, lightDir), 0.0);
        vec3 ref = reflect(rd, n);
        float spec = pow(max(dot(ref, lightDir), 0.0), 32.0);
        float fresnel = pow(1.0 - max(dot(-rd, n), 0.0), 3.0);

        // Thin-film interference oxidation layers
        float filmThickness = dot(hitUVW, vec3(1.2, 2.5, 3.8)) + audioPhase * 0.2;
        vec3 filmCol = thinFilmColor(filmThickness);

        // Terrace photo projection
        vec2 terraceUV = hitUVW.xy * 0.5 + 0.5;
        vec3 photoCol = img(fract(terraceUV));

        // Stepped laser resonance pulses on kick
        float terraceRing = sin(length(hitUVW) * 20.0 - time * 6.0);
        float laserGlow = exp(-abs(terraceRing) * 4.0) * audioKick * 2.5;

        // Combine metallic bismuth shading
        vec3 metalAlbedo = mix(vec3(0.85, 0.88, 0.92), filmCol, 0.75) * photoCol;
        col = metalAlbedo * (diff * 0.6 + 0.3) + vec3(1.0) * spec * 0.8 + filmCol * fresnel * 1.2;
        col += vec3(0.2, 0.8, 1.0) * laserGlow;

        // Ambient occlusion from raymarching steps
        float ao = clamp(1.0 - float(hitSteps) / 80.0, 0.0, 1.0);
        col *= ao;

        // Volumetric crystal depth fog.  At 0.12 the corridor (totalDist
        // 10..20) sat in 70-90% fog -- THE reason the probe was near-black.
        col = mix(col, vec3(0.02, 0.01, 0.05), 1.0 - exp(-totalDist * 0.045));
    } else {
        // Glow at distance
        col = vec3(0.02, 0.01, 0.05) + vec3(0.1, 0.3, 0.6) * exp(-minDist * 8.0);
    }

    col = hueRot(col, 0.25 * sin(hue));   // bounded: full rotation broke the bismuth identity
    col = pow(col, vec3(0.9)); // Vibrance boost

    // Headlight: the corridors carried no near light at all and probed
    // near-black front to back.
    col *= 1.0 + 1.5 * exp(-totalDist * 0.30);
    // Headlight: the corridors carried no near light at all and probed
    // near-black front to back.
    col *= 1.0 + 1.5 * exp(-totalDist * 0.30);
    fragColor = vec4(col, 1.0);
}
