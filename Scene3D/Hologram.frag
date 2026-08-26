#version 330 core
out vec4 fragColor;
/**
 * @file Hologram.frag
 * @brief GEOM="MESH" FAMILY: any loaded model re-read as a sci-fi holotable
 * projection -- wireframe over a see-through fill, scanlines, edge glow and
 * signal dropouts. This family deliberately ships NO assets of its own: it
 * is pointed at the ships and stations already in Models/, so every existing
 * mesh gets a second, completely different look for free (the model= config
 * attribute picks which).
 *
 * TRANSPARENCY WITHOUT BLENDING. geom="mesh" draws opaque with GL_BLEND off
 * (see Scene3DShader::draw()), so a hologram cannot simply be given a low
 * alpha. Instead the fill is DITHERED: an ordered screen-space threshold
 * discards most fill fragments and keeps the wire, scanlines and rim. That
 * gives real see-through -- discarded fragments never write depth, so the
 * backdrop behind genuinely shows through -- and it stays correct whatever
 * order the mesh and the sky shell happen to be drawn in.
 *   audioKick    -> dropout glitch (geometry stage) + a brightness surge
 *   audioSwell   -> overall projection strength
 *   audioAdvance -> scanline travel, turntable rate (geometry stage)
 *
 * Per-instance: sizeP, spinP (turntable rate), tintP (projection hue,
 *               radians -- 0 is valid, so it has no "unset" fallback),
 *               scanP (scanline density).
 * Per-activation variety: hueP float palette offset (0..6.28).
 */

uniform float time;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;

uniform float hueP;
uniform float tintP;
uniform float scanP;

in vec2  vUV;
in vec3  vNormal;
in vec3  vPos;
in vec3  vLocalPos;
in vec3  vBary;
in float vBg;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
float hash13(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise3(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash13(i + vec3(0.0,0.0,0.0)), n100 = hash13(i + vec3(1.0,0.0,0.0));
    float n010 = hash13(i + vec3(0.0,1.0,0.0)), n110 = hash13(i + vec3(1.0,1.0,0.0));
    float n001 = hash13(i + vec3(0.0,0.0,1.0)), n101 = hash13(i + vec3(1.0,0.0,1.0));
    float n011 = hash13(i + vec3(0.0,1.0,1.0)), n111 = hash13(i + vec3(1.0,1.0,1.0));
    return mix(mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y),
               mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y), f.z);
}

// 4x4 ordered (Bayer) threshold. An ordered pattern beats a random one here:
// white noise makes the fill crawl and sparkle between frames, while a fixed
// screen-space matrix holds still, so the hologram reads as a steady mesh of
// dots rather than television static.
float bayer4(vec2 p)
{
    int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));
    int i = x + y * 4;
    int m[16] = int[16]( 0,  8,  2, 10,
                        12,  4, 14,  6,
                         3, 11,  1,  9,
                        15,  7, 13,  5);
    return (float(m[i]) + 0.5) / 16.0;
}

// ---- Sky shell: the holotable's room. Near-black, with a cold pool of
// light on the deck below the projection and a faint tech grid, so the
// hologram has somewhere to stand. ----
vec3 renderSky(vec3 dir, vec3 tint)
{
    vec3 col = vec3(0.008, 0.010, 0.016) * (1.0 - dir.y * 0.4);
    if (dir.y < -0.02)
    {
        float t = -1.0 / dir.y;
        vec2 g = dir.xz * t;
        vec2 cell = abs(fract(g * 0.5) - 0.5);
        float line = 1.0 - smoothstep(0.0, 0.06, min(cell.x, cell.y));
        float fade = exp(-t * 0.09);
        col += tint * line * fade * 0.22;
        col += tint * 0.10 * pow(max(1.0 - t * 0.06, 0.0), 2.0) * (0.6 + 0.5 * audioSwell);
    }
    col += vec3(0.6, 0.7, 0.8) * step(0.9985, hash13(floor(dir * 300.0))) * 0.25;
    return col;
}

void main()
{
    vec3 tint = hsv2rgb(vec3(tintP / 6.2831853, 0.62, 1.0));

    if (vBg > 0.5)
    {
        fragColor = vec4(renderSky(normalize(vPos), tint), 1.0);
        return;
    }

    float hue = (hueP > 0.01 ? hueP : 0.0);
    float sc  = (scanP > 0.01 ? scanP : 1.0);

    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(-vPos);

    // Silhouette glow: a projection is brightest where the surface turns
    // away, because that is where the most of it lies along the sight line.
    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 2.2);

    // Wireframe: distance to the nearest triangle edge, in a width that
    // stays constant on screen thanks to the derivative.
    //
    // Gated on triangle SIZE. These meshes carry ~20k triangles, so on
    // screen most are around a pixel across -- and then every pixel is
    // "near an edge", the wire covers the whole surface, and the hologram
    // comes out a solid blob. fwidth(d) is large exactly when the triangle
    // is small, so fading the wire out as fwidth grows draws it only where
    // a triangle is actually big enough to read as a wire. That makes the
    // effect self-adjusting across meshes of very different density instead
    // of needing a hand-tuned constant per model.
    float d = min(min(vBary.x, vBary.y), vBary.z);
    float fw = fwidth(d);
    float wire = (1.0 - smoothstep(0.0, fw * 1.6, d)) * smoothstep(0.30, 0.09, fw);

    // Scanlines travelling up the object in OBJECT space, so they climb the
    // model itself rather than sliding across the screen.
    float scan = 0.5 + 0.5 * sin((vLocalPos.y * 90.0 * sc) - time * 3.0 - audioAdvance * 1.5);
    scan = pow(scan, 3.0);

    // A slow bright sweep, like the projector refreshing a slice at a time.
    float sweep = fract(vLocalPos.y * 0.9 - time * 0.14 - audioAdvance * 0.08);
    float sweepBand = smoothstep(0.0, 0.03, sweep) * (1.0 - smoothstep(0.03, 0.10, sweep));

    // How solid this fragment is. Everything above is a reason to KEEP a
    // fragment; the dither below decides which of the weak ones survive.
    // Deliberately small numbers: the dither can only make the projection
    // see-through if most fragments land BELOW the threshold. Summing terms
    // that each look reasonable on their own pushed alpha over 1 across the
    // whole surface, nothing was discarded, and the hologram rendered as a
    // solid glowing lump.
    float alpha = 0.05                       // faint body fill, so the volume reads
                + wire * 0.85                // the structure itself, where triangles are big enough
                + fresnel * 0.40             // silhouette
                + scan * 0.10                // scanline banding
                + sweepBand * 0.60;          // refresh sweep
    alpha *= (0.70 + 0.30 * audioSwell + 0.40 * audioKick);

    // Interference: horizontal noise bands that thin the projection out.
    float interf = noise3(vec3(vLocalPos.y * 40.0, time * 2.2, 0.0));
    alpha *= mix(0.55, 1.0, smoothstep(0.25, 0.6, interf));

    if (alpha < bayer4(gl_FragCoord.xy)) discard;

    // Colour: the tint everywhere, pushed toward white at the brightest
    // features so the wire and sweep read as overdriven rather than just
    // more saturated.
    float hot = clamp(wire * 0.8 + sweepBand * 0.9 + fresnel * 0.4, 0.0, 1.0);
    vec3 col = mix(tint, vec3(1.0), hot * 0.55);
    col *= 0.55 + 1.25 * clamp(alpha, 0.0, 1.4);
    col += tint * fresnel * (0.4 + 0.7 * audioSwell);

    if (hue > 0.001) col = hueRot(col, 0.12 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
