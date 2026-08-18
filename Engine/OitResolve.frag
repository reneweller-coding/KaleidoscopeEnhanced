#version 330 core
/**
 * @file OitResolve.frag
 * @brief Resolves weighted-blended order-independent transparency: combines the colour-accumulation and reveal buffers into one final image.
 *
 * Fullscreen fragment pass reading two textures written earlier by a
 * transparent-geometry accumulation pass: texAccum (RGBA16F sum of
 * colour*alpha*weight in RGB, sum of alpha*weight in A) and texReveal (R16F
 * product of (1-alpha) across all layers). Divides accumulated colour by its
 * accumulated weight (guarded against denormal weights blowing up into
 * infinities), discards fully-uncovered pixels, and outputs the weighted-
 * average layer colour with alpha = 1-reveal. Because both accumulation
 * operations are commutative, the result never depends on draw order, so no
 * depth sorting of transparent geometry is needed.
 */
out vec4 fragColor;
// -----------------------------------------------------------------------
// Weighted-blended OIT never sorts anything.  Each transparent fragment adds
// its premultiplied colour into an accumulation buffer, scaled by a weight that
// falls off with distance, and multiplies a second buffer down by (1 - alpha).
// Both operations are COMMUTATIVE, which is the whole idea: the result cannot
// depend on the order the fragments arrived in, so no sorting is needed and no
// popping is possible when geometry rotates through itself.
//
// What comes back out is the weighted average colour of all the layers, and how
// much background they left uncovered.  The approximation is that layers at
// similar depths are averaged rather than composited in sequence — invisible
// for glass and smoke, wrong for a stack of opaque cards, which is exactly the
// trade this technique exists to make.
uniform sampler2D texAccum;     // RGBA16F: sum of colour*alpha*w, and sum of alpha*w
uniform sampler2D texReveal;    // R16F: product of (1 - alpha)
uniform vec2 resolution;

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;

    float reveal = texture(texReveal, uv).r;
    // Nothing covered this pixel: leave the frame exactly as it was.  Testing
    // against a hair below 1 rather than == 1 keeps float noise from drawing a
    // faint veil across the whole image.
    if (reveal > 0.9999)
        discard;

    vec4 acc = texture(texAccum, uv);

    // Guard the divide.  The weights fall off steeply with depth, so a distant
    // layer can push the accumulated weight down to a denormal — and dividing
    // by that produces infinities that show up as white confetti.
    float w = max(acc.a, 1e-5);
    vec3 col = acc.rgb / w;

    // isinf/isnan are cheap insurance here: one bad pixel in an additive buffer
    // survives every later stage, including the photosensitivity limiter, which
    // reasons about averages and not about single blown texels.
    if (any(isinf(col)) || any(isnan(col)))
        col = vec3(0.0);

    fragColor = vec4(col, 1.0 - reveal);
}
