// Voyager.frag
// -----------------------------------------------------------------------
// Adapted from "Voyager" by @kishimisu (2024) — https://www.shadertoy.com/view/M33XDH
// Original licensed CC BY-NC-SA 4.0 (attribution kept per the licence).
//
// A volumetric fly-through of glowing, endlessly-repeating cells — like a deep-
// space probe drifting through a field of light.  Adapted to our engine:
//   * Shadertoy conventions -> ours (gl_FragCoord/resolution/time/tex0, texture2D).
//   * IMAGE-FORWARD: the source image is sampled through the mirror-folded screen
//     coordinate; it colours the light field, shifts the palette along the ray
//     (image-linked, like the original's channel texture) and drifts through as a
//     faint nebula, so the picture is part of the scene.
//   * Music drives the travel, glow and palette.  Motion is JUMP-FREE: the
//     forward travel uses the host-integrated audioAdvance and rotation uses
//     audioPhase, never time*audio (anti-flicker).
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioAdvance;   // integrated forward travel (jump-free)
uniform float audioPhase;     // integrated rotation (jump-free)
uniform float audioBeat;
uniform float audioBass;
uniform float audioLevel;
uniform float audioOnset;
uniform float audioCentroid;
uniform float audioValence;

vec3 img(vec2 uv) { return (interpolation * texture2D(tex0, uv)
                          + (1.0 - interpolation) * texture2D(tex1, uv)).rgb; }

// Colour from a slowly-drifting crop of the picture, indexed by a scalar so the
// palette comes from the image and keeps changing over time + with the harmony.
vec3 imgPal(float x)
{
    vec2 cc = vec2(0.5) + 0.32 * vec2(cos(time * 0.045 + audioPhase * 0.12),
                                      sin(time * 0.033 + audioPhase * 0.09));
    return img(fract(cc + 0.24 * vec2(cos(x), sin(x * 1.31))));
}

// Hue rotation around the luminance axis (keeps brightness + saturation).
vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    vec2 R = resolution;
    // Mirror-folded, aspect-normalised screen coordinate (the kaleidoscopic fold).
    vec2 u = abs(gl_FragCoord.xy + gl_FragCoord.xy - R) / R.y;

    // Source image sampled once through the folded coord: colours the light field
    // and its brightness shifts the palette along the ray.
    vec2  iuv    = vec2(u.x * R.y / R.x, u.y);
    vec3  pic    = img(fract(iuv));
    float picLum = dot(pic, vec3(0.299, 0.587, 0.114));

    float T    = time;                        // rotation clock
    float trav = time + audioAdvance * 4.0;   // forward travel (jump-free)
    vec3  f    = vec3(0.2, 2.0, 0.2);         // cell size

    // Ray direction: the folded coord, rotated slowly over time (+ gentle audio).
    float a    = T / 16.0 + audioPhase * 0.10;
    vec4  c4   = cos(a + vec4(0.0, 33.0, 11.0, 0.0));
    mat2  rotM = mat2(c4.x, c4.y, c4.z, c4.w);
    vec3  dir  = normalize(vec3(u * rotM, 1.0));

    // Beats / onsets brighten the light field (slew-limited upstream -> no strobe).
    float glow = 0.07 * (1.0 + 0.6 * audioBeat + 0.4 * audioOnset + 0.3 * audioBass);

    vec4  O = vec4(0.0);
    float t = 0.0;
    for (int i = 0; i < 50; i++)
    {
        vec3 q = t * dir;
        vec3 p = q;
        p.z += trav;
        float n = sin(p.z) * cos(p.x * 1.4 + T / 4.0) * cos(p.z * 1.2 - T * 0.5) * 0.5 + 0.5;
        p.y += 1.0 + q.z * sin(T / 6.0) * 0.2 - n;
        p = mod(p, f + f) - f;
        float d  = length(p) - 0.1;
        t += d;
        float dd = d + 1.0;
        vec4  pal = 1.0 + cos( length(q) * 0.14
                             + length(u) * 3.0
                             - T
                             - picLum * 2.0
                             + vec4(0.0, 1.0, 2.0, 0.0) );
        O += glow * pow(n, 5.0) / dd * pal;
    }

    vec3 col = O.rgb;

    // Mood grade: warm/cool by centroid, saturation by valence.
    col *= mix(vec3(0.70, 0.85, 1.25), vec3(1.30, 1.05, 0.70), audioCentroid);
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 0.6 + 0.6 * audioValence);

    // Image-driven colour: a drifting crop of the picture (keyed by the effect's
    // brightness + screen position) modulates the palette, so the colours come
    // from the image and keep changing (like the kaleidoscope folding crops).
    float himg = dot(imgPal(dot(col, vec3(0.333)) * 6.0
                 + length(gl_FragCoord.xy / resolution - 0.5) * 4.0), vec3(0.333));
    col = hueRot(col, (himg - 0.5) * 3.0 + time * 0.05);

    col *= 0.9 + 0.5 * audioLevel;

    gl_FragColor = vec4(col, 1.0);
}
