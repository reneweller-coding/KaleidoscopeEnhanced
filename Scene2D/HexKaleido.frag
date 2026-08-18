#version 330 core
out vec4 fragColor;
/**
 * @file HexKaleido.frag
 * @brief Adapted from an untitled Shadertoy hex-kaleidoscope — https://www.shadertoy.com/view/Xljczw
 * (author not specified on the page; adapted under the site's standard terms).
 *
 * A layered hexagonal kaleidoscope: each iteration re-tiles the plane into
 * hexagons and rings glow at a shifting radius, giving a jewel-like radiating
 * lattice.  Adapted to our engine: GLSL 1.20 (gl_FragCoord/resolution/time),
 * jump-free audio motion (the host-integrated audioAdvance added to time,
 * never time*audio), beat/onset brightness, mood grade, and IMAGE-DRIVEN
 * colour: a slowly-drifting crop of the source picture (imgPal) rotates the
 * palette's hue (hueRot) so the jewel colours come from the ever-changing
 * image, exactly like the other adapted shaders in this set.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioAdvance;
uniform float audioPhase;
uniform float audioBeat;
uniform float audioOnset;
uniform float audioLevel;
uniform float audioCentroid;
uniform float audioValence;

uniform float audioChromaHue;
// Per-activation variety (re-rolled each activation; 0 = default):
uniform float zoomP;    // hex-lattice scale        (0 -> 1.0; 0.7 = coarser, 1.6 = finer)
uniform float swirlP;   // radius-coupled swirl amt (0 -> none; curves the lattice)

const float PI     = 3.14159265358979;
const float ROOT_3 = 1.7320508075688772;

vec3 img(vec2 uv) { return (interpolation * texture(tex0, uv)
                          + (1.0 - interpolation) * texture(tex1, uv)).rgb; }

// Colour from a slowly-drifting crop of the picture, indexed by a scalar so the
// palette comes from the image and keeps changing over time + with the harmony.
vec3 imgPal(float x)
{
    vec2 cc = vec2(0.5) + 0.32 * vec2(cos(time * 0.045 + audioPhase * 0.12),
                                      sin(time * 0.033 + audioPhase * 0.09));
    return img(fract(cc + 0.24 * vec2(cos(x), sin(x * 1.31))));
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

// Hue rotation around the luminance axis (keeps brightness + saturation).
vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

// Palette by iq (https://iquilezles.org/articles/palettes)
vec3 palette(float t)
{
    return imgPalette(t);
}

vec4 getHex(vec2 p)
{
    vec2 s  = vec2(1.0, ROOT_3);
    vec4 hC = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
    vec4 h  = vec4(p - hC.xy * s, p - (hC.zw + 0.5) * s);
    return dot(h.xy, h.xy) < dot(h.zw, h.zw)
        ? vec4(h.xy, hC.xy)
        : vec4(h.zw, hC.zw + 0.5);
}

float hexDist(vec2 p)
{
    vec2 s = vec2(1.0, ROOT_3);
    p = abs(p);
    return max(dot(p, s * 0.5), p.x);
}

void main()
{
    vec2 fragCoord = gl_FragCoord.xy;
    float tt = time + audioAdvance * 3.0;    // jump-free (host-integrated) clock

    float r   = PI / 6.0;
    mat2  rot = mat2(cos(r), sin(r), -sin(r), cos(r));

    vec2 uv0 = 2.0 * (fragCoord / resolution) - 1.0;
    uv0.x *= resolution.x / resolution.y;
    // Per-activation lattice scale + a radius-coupled swirl that bends the
    // straight hex lattice into curved, spiralling arms (jump-free clocks).
    float zoomV = (zoomP <= 0.01) ? 1.0 : zoomP;
    uv0 *= zoomV;
    if (swirlP > 0.001)
    {
        float ang = swirlP * length(uv0) * 1.5 + audioPhase * 0.10;
        uv0 = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * uv0;
    }
    vec2 uv = uv0;

    vec2 h0 = getHex(0.5 * uv).xy;
    vec2 h  = h0;

    float d0 = length(uv0);
    vec3  color = vec3(0.0);

    for (int i = 0; i < 5; i++)
    {
        float fi = float(i);
        h = getHex(1.1 * ROOT_3 * h * rot).xy;

        float d = hexDist(h);
        d = 2.0 * d * pow(0.2, d0);
        d = 0.5 * sin(4.0 * d - 0.5 * tt + fi * 2.0 * PI / 7.0);
        d = 0.04 / d;
        d = pow(d, 2.0);

        color += d * palette(length(h0) + 0.3 * fi);
    }

    color *= 1.0 + 0.5 * audioBeat + 0.3 * audioOnset;

    // Mood grade.
    color *= mix(vec3(0.75, 0.85, 1.20), vec3(1.25, 1.05, 0.75), audioCentroid);
    float lum = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(lum), color, 0.6 + 0.6 * audioValence);

    // Image-driven colour: a drifting crop of the picture rotates the hue.
    float himg = dot(imgPal(dot(color, vec3(0.333)) * 6.0
                 + length(fragCoord / resolution - 0.5) * 4.0), vec3(0.333));
    color = hueRot(color, (himg - 0.5) * 3.0 + time * 0.05);

    color *= 0.9 + 0.5 * audioLevel;
    color  = pow(max(color, 0.0), vec3(1.0 / 2.2));   // gamma

    fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
