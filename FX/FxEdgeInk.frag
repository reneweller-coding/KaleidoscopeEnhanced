#version 330 core
out vec4 fragColor;
/**
 * @file FxEdgeInk.frag
 * @brief FX EDGE INK: line-art / ink-outline overlay drawn from the second
 * derivative of the scene's depth, so silhouettes and creases ink while a
 * receding plane at any angle stays clean.
 *
 * Falls back to a luminance-gradient edge test where depth isn't valid
 * (2D scenes); interior tones are flattened into a small number of
 * posterised bands between the inked lines.
 *   interpolation -> cross-fades the two inked scene layers
 *   audioChromaHue-> shifts the paper tint and ink colour with the harmonic hue
 *   audioLevel    -> thickens the ink line weight
 *   audioBeat     -> subtle overall brightness pulse
 *   audioKick     -> extra brightness pulse
 *   audioHigh     -> adds a touch of ink-coloured bloom in the highs
 */
// FxEdgeInk.frag — ink outlines from depth, flat wash inside them.
// -----------------------------------------------------------------------
// The whole quality of a line-art filter is in what counts as an edge.  The
// obvious test — threshold the difference between neighbouring depths — is
// wrong, and wrong in a way that looks almost right at first: a floor receding
// from the camera has a large depth difference between EVERY pair of adjacent
// pixels, so the ground inks solid black while a wall facing the camera gets no
// outline at all.  The test fires on slope, and slope is not silhouette.
//
// The fix is to use the SECOND difference instead: compare the centre sample
// against the average of its two opposite neighbours.  On any plane, whatever
// its angle to the camera, that average IS the centre — linear interpolation is
// exact — so the response is zero.  It is non-zero only where the surface
// actually breaks: a silhouette, or a crease.  Dividing by distance afterwards
// keeps a far outline as heavy as a near one.
//
// Where there is no depth (a 2D scene), it falls back to a luminance edge, which
// is the best available answer rather than a blank frame.
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform sampler2D texDepth0;
uniform sampler2D texDepth1;
uniform vec2  depthValid;
uniform vec2  nearFar;
uniform float tanHalfFov;
uniform float interpolation;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioHigh;
uniform float audioSubBass;
uniform float audioChromaHue;
uniform float audioAmbient;

uniform float inkP;         // preset: line weight
uniform float bandsP;       // preset: how many tone steps inside the lines
uniform float paperP;       // preset: warmth of the paper

vec3 hue2rgb(float h)
{
    return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}

float linearise(float d)
{
    float n = nearFar.x, f = nearFar.y;
    float z = d * 2.0 - 1.0;
    return (2.0 * n * f) / (f + n - z * (f - n));
}

float depthEdge(sampler2D dep, vec2 uv, vec2 px)
{
    float c = linearise(texture(dep, uv).r);
    float l = linearise(texture(dep, uv - vec2(px.x, 0.0)).r);
    float r = linearise(texture(dep, uv + vec2(px.x, 0.0)).r);
    float u = linearise(texture(dep, uv - vec2(0.0, px.y)).r);
    float d = linearise(texture(dep, uv + vec2(0.0, px.y)).r);

    // Second difference: identically zero across any planar surface, so a
    // steeply raking floor produces no line while a silhouette produces a
    // strong one.
    float ex = abs(l + r - 2.0 * c);
    float ey = abs(u + d - 2.0 * c);

    // Scale by distance so a far edge is not thinner than a near one purely
    // because the same step in depth spans fewer world units up close.
    return (ex + ey) / max(c, 0.5);
}

float lumaEdge(sampler2D src, vec2 uv, vec2 px)
{
    vec3 w = vec3(0.299, 0.587, 0.114);
    float c = dot(texture(src, uv).rgb, w);
    float l = dot(texture(src, uv - vec2(px.x, 0.0)).rgb, w);
    float r = dot(texture(src, uv + vec2(px.x, 0.0)).rgb, w);
    float u = dot(texture(src, uv - vec2(0.0, px.y)).rgb, w);
    float d = dot(texture(src, uv + vec2(0.0, px.y)).rgb, w);
    return length(vec2(r - l, d - u));
}

vec3 inked(sampler2D src, sampler2D dep, vec2 uv, float valid,
           vec2 px, vec3 paper, vec3 inkCol, float weight, float bands)
{
    vec3 c = texture(src, uv).rgb;

    // Flatten the interior into steps.  Line art reads because the areas between
    // the lines are quiet; leaving a full-range image inside them just gives a
    // photograph with a border drawn on it.
    float lum = dot(c, vec3(0.299, 0.587, 0.114));
    float stepped = floor(lum * bands + 0.5) / bands;
    vec3 flat_ = mix(vec3(stepped), c * (stepped / max(lum, 1e-3)), 0.55);
    flat_ = mix(paper, flat_, 0.82);

    float e = (valid > 0.5) ? depthEdge(dep, uv, px) * 26.0
                            : lumaEdge(src, uv, px) * 3.4;
    e = pow(clamp(e * weight, 0.0, 1.0), 0.75);

    return mix(flat_, inkCol, e);
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 px = (1.0 + 0.9 * clamp(inkP, 0.3, 2.0)) / resolution;

    vec3 paper = mix(vec3(0.96, 0.94, 0.88), vec3(0.10, 0.10, 0.13),
                     1.0 - clamp(paperP, 0.0, 1.0));
    paper = mix(paper, hue2rgb(fract(0.10 + 0.12 * sin(audioChromaHue))), 0.10);

    // The ink itself is not black: it takes a little of the harmonic colour, so
    // the drawing shifts key with the music instead of only changing brightness.
    vec3 inkCol = mix(vec3(0.03, 0.03, 0.05),
                      hue2rgb(fract(0.58 + 0.20 * sin(audioChromaHue))), 0.30);

    float weight = 0.7 + 1.5 * clamp(inkP, 0.3, 2.0) * (0.6 + 0.8 * audioLevel);
    float bands = floor(mix(3.0, 9.0, clamp(bandsP, 0.0, 1.0)));

    vec3 a = inked(tex0, texDepth0, uv, depthValid.x, px, paper, inkCol, weight, bands);
    vec3 b = inked(tex1, texDepth1, uv, depthValid.y, px, paper, inkCol, weight, bands);
    vec3 col = mix(b, a, clamp(interpolation, 0.0, 1.0));

    col *= 1.0 + 0.10 * audioBeat + 0.08 * audioKick;
    col += inkCol * 0.05 * audioHigh;
    col = col / (1.0 + col * 0.10);
    fragColor = vec4(col, 1.0);
}
