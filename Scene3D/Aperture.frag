#version 330 core
out vec4 fragColor;

/**
 * @file Aperture.frag
 * @brief The model is used as a hole, not as an object. Its silhouette is a
 * window: inside it a flat scene plays, outside there is almost nothing. The
 * shape turns, so the window keeps changing form while what shows through it
 * carries on undisturbed.
 *
 * This is the one mesh family that composes with the REST of the catalogue
 * rather than adding to it -- what shows through is built from the same
 * material every 2D scene uses, the current photographs (tex0/tex1), so the
 * models and the photo library finally meet. Four interiors, chosen per
 * instance: a kaleidoscope of the photo, a tunnel receding through the hole,
 * a spectrum standing in the opening, and a liquid warp of the photo.
 *
 * Nothing here lights the model or samples its material. The surface detail of
 * a 150k-triangle hull is invisible by construction; only its outline matters.
 * That also makes this the cheapest family in the set.
 *
 *   audioAdvance -> interior travel (tunnel depth, kaleidoscope rotation)
 *   audioKick    -> rim flare
 *   audioSwell   -> interior brightness
 *   audioBass/audioHigh -> spectrum interior
 *
 * Per-instance: sizeP, spinP, patternP (0..3 interior), tintP (rim hue).
 * Per-activation variety: hueP float palette offset (0..6.28).
 */

uniform sampler2D tex0;
uniform sampler2D tex1;

uniform vec2  resolution;      // viewport size in PIXELS (the C++ side calls
                               // its location member texSizeRcp, but it uploads
                               // width/height, not their reciprocal)
uniform float time;
uniform float interpolation;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioBass;
uniform float audioHigh;

uniform float hueP;
uniform float tintP;
uniform float patternP;

in vec3  vNormal;
in vec3  vPos;
in vec3  vLocalPos;
in float vBg;

vec3 hueRot(vec3 c, float a)
{
    const vec3 k = vec3(0.57735);
    float ca = cos(a);
    return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

// The two photographs the rest of the catalogue is drawing from, cross-faded
// exactly as every 2D scene sees them.
vec3 photo(vec2 uv)
{
    uv = clamp(uv, 0.0, 1.0);
    return mix(texture(tex1, uv).rgb, texture(tex0, uv).rgb, 1.0 - interpolation);
}

vec3 imgPalette(float t)
{
    // Sample the photo along a diagonal: a cheap palette that is guaranteed to
    // be in key with whatever is on screen elsewhere.
    return photo(vec2(fract(t), fract(t * 0.37 + 0.2)));
}

void main()
{
    float hue = (hueP > 0.01 ? hueP : 0.0);
    vec3 rimTint = hueRot(vec3(1.0, 0.72, 0.35), tintP);

    // Screen coordinates, aspect-corrected and centred. The interior is drawn
    // in SCREEN space on purpose: it must feel like a fixed scene behind a
    // moving hole, not like a texture painted on a turning object.
    vec2 res = max(resolution, vec2(1.0));
    vec2 uv = (gl_FragCoord.xy - 0.5 * res) / res.y;

    if( vBg > 0.5 )
    {
        // Outside the window: almost black, with a slow vignette so the frame
        // has a centre and the silhouette has something to sit against.
        float r = length(uv);
        vec3 col = mix(vec3(0.030, 0.032, 0.040), vec3(0.004), smoothstep(0.2, 1.1, r));
        // The surround answers the kick faintly -- the beat sits outside
        // the window (the hull no longer pulses), so the frame breathes.
        col += imgPalette(0.5) * 0.035 * (1.0 + 0.9 * audioKick)
             * (1.0 - smoothstep(0.0, 0.9, r));
        fragColor = vec4(col, 1.0);
        return;
    }

    int mode = int(clamp(patternP, 0.0, 3.0) + 0.5);
    vec3 col;

    if( mode == 0 )
    {
        // Kaleidoscope of the photograph: fold the plane into a wedge and let
        // the fold count breathe with the bass.
        float sides = 6.0 + floor(2.0 * audioBass) * 2.0;
        float a = atan(uv.y, uv.x) + time * 0.05 + audioAdvance * 0.03;
        float r = length(uv);
        float seg = 6.2831853 / sides;
        a = abs(mod(a, seg) - seg * 0.5);
        vec2 k = vec2(cos(a), sin(a)) * r;
        col = photo(k * 1.15 + 0.5);
        col *= 0.75 + 0.9 * audioSwell;
    }
    else if( mode == 1 )
    {
        // A tunnel receding through the opening. Polar coordinates with 1/r
        // depth: the classic, and it reads as real depth behind the hole.
        float r = max(length(uv), 1e-3);
        float a = atan(uv.y, uv.x);
        vec2 t = vec2(a / 3.14159265, 0.32 / r + audioAdvance * 0.06 + time * 0.05);
        col = photo(fract(t * vec2(1.0, 0.5)));
        col *= smoothstep(0.0, 0.45, r);                // dark at the vanishing point
        col *= 0.7 + 1.0 * audioSwell;
    }
    else if( mode == 2 )
    {
        // A spectrum standing in the opening, drawn from the photo's palette
        // so it stays in key with the rest of the show.
        float bars = 26.0;
        float x = floor((uv.x + 0.9) * bars) / bars;
        float h = 0.10 + 0.65 * (0.35 * audioBass + 0.4 * audioSwell + 0.45 * audioHigh)
                       * (0.45 + 0.55 * fract(sin(x * 91.7) * 4371.3));
        float on = step(uv.y + 0.45, h) * step(-0.45, uv.y);
        col = imgPalette(fract(x * 1.7 + 0.15)) * (0.35 + 1.5 * on);
        col += rimTint * on * 0.35;
    }
    else
    {
        // The photograph itself, warped -- slow enough to read as liquid glass
        // rather than as a wobble.
        float w = 0.055 * sin(uv.y * 6.0 + time * 0.5 + audioAdvance * 0.2);
        float w2 = 0.045 * cos(uv.x * 5.0 - time * 0.42);
        col = photo(uv * 0.85 + vec2(w, w2) + 0.5);
        col *= 0.8 + 0.8 * audioSwell;
    }

    // The rim of the window. Grazing fragments are the outline -- but a broad
    // fresnel (pow 3) also catches every mid-angle facet of a FLAT model, so a
    // blade or panel turning through the grazing range lit up in whole striped
    // bands along its face (reported on the scythe's edge). The window is cut
    // tighter now: only the last stretch before the silhouette counts as rim,
    // and the kick brightens it less, so a passing band cannot flash the face.
    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(-vPos);
    float rim = smoothstep(0.62, 0.92, 1.0 - abs(dot(n, viewDir)));
    col = mix(col, rimTint, clamp(rim * (0.55 + 0.45 * audioKick), 0.0, 1.0));

    if( hue > 0.001 ) col = hueRot(col, 0.14 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
