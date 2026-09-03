#version 330 core
out vec4 fragColor;
/**
 * @file MatryoshkaPhotoDoll.frag
 * @brief MATRYOSHKA PHOTO DOLL: a Droste zoom whose recursion point comes
 * from the photo itself.  The brightest region of the picture (found by
 * comparing a coarse grid of mip samples) becomes the doll inside the doll:
 * a smaller copy of the whole photo is placed there, and a smaller one
 * inside that, so every photo gets its own zoom path instead of a fixed
 * centre.  The zoom is log-periodic in the copy ratio -- when one level has
 * grown to the size of the last, the picture is identical -- so the fall is
 * endless and seamless.  The recursion point itself is slewed by sampling
 * the same coarse grid for both photos of the crossfade.  Music is light.
 *
 * Audio Reactivity:
 *   sceneAdvance -> the zoom (music-paced, periodic)
 *   audioKick    -> the copy frames flash (light)
 *   audioSwell   -> copy tint (slow)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: ratioP (copy ratio), zoomP (rate), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float ratioP;
uniform float zoomP;
uniform float hueP;

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

// The brightest cell of a coarse grid, for the current crossfade of photos,
// as a soft-argmax so the point glides when the photos change.
vec2 brightSpot()
{
    vec2 acc = vec2(0.0);
    float wsum = 0.0;
    for (int j = 0; j < 4; ++j)
    for (int i = 0; i < 4; ++i)
    {
        vec2 c = (vec2(float(i), float(j)) + 0.5) / 4.0;
        vec3 s = interpolation * textureLod(tex0, c, 4.0).rgb + (1.0 - interpolation) * textureLod(tex1, c, 4.0).rgb;
        float l = dot(s, vec3(0.299, 0.587, 0.114));
        float w = exp(l * 9.0);
        acc += c * w; wsum += w;
    }
    vec2 spot = acc / max(wsum, 1e-4);
    return clamp(spot, 0.2, 0.8);            // keep the doll inside the picture
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float ratio = 0.28 + 0.2 * clamp(ratioP, 0.0, 1.0);      // each copy is this fraction of its parent
    float L = -log(ratio);                                    // zoom period in log-scale
    float zoom = sceneAdvance * 0.2 * (zoomP > 0.05 ? zoomP : 1.0) + sceneTime * 0.04;
    float zf = mod(zoom, L);
    vec2 spot = brightSpot();

    // Scale the picture about the spot by exp(zf): as zf runs from 0 to L
    // the picture grows by 1/ratio, and the copy that was inside the spot is
    // now the whole picture -- identical to zf = 0.
    vec2 q = (uv - spot) * exp(-zf) + spot;                 // picture-space point at the current zoom
    // Which nesting level holds this pixel: walk inward while the point lies
    // inside the copy window at the spot.
    vec3 col = vec3(0.0);
    float frame = 0.0;
    float depth = 0.0;
    vec2 win = vec2(ratio * 0.5);                             // half size of the copy window (uv units)
    for (int k = 0; k < 6; ++k)
    {
        vec2 d = (q - spot) / win;
        if (abs(d.x) < 1.0 && abs(d.y) < 1.0)
        {
            // Inside the copy: map into the copy's own picture space.
            q = spot + d * 0.5 * vec2(1.0);                   // the copy shows the WHOLE picture in the window
            q = (d * 0.5 + 0.5);
            depth += 1.0;
            vec2 e = 1.0 - abs(d);
            frame += exp(-min(e.x, e.y) * 40.0);
        }
        else break;
    }
    // Also the outer copies: the picture we zoom into is itself inside a
    // larger picture (levels behind).  Those simply are the picture at q.
    col = img(clamp(q, 0.0, 1.0));
    // Copies tint slightly per depth so the nesting reads.
    vec3 tint = imgPalette(hue * 0.159 + 0.1 * depth);
    col = mix(col, col * tint * 1.8, 0.2 * min(depth, 3.0) * (0.5 + 0.5 * clamp(audioSwell, 0.0, 1.0)));
    // Frames of the copies flash on the kick.
    col += imgPalette(hue * 0.159 + 0.9) * frame * (0.25 + 0.9 * audioKick);
    col *= 0.8 + 0.5 * audioLevel;
    // Soft vignette.
    vec2 pv = (uv - 0.5) * vec2(aspect, 1.0);
    col *= 1.0 - 0.35 * smoothstep(0.6, 1.1, length(pv));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
