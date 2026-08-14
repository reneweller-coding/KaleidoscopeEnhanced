#version 330 core
// SmokeHall.frag — stone in the opaque pass, participating medium in the
// transparent one.
// -----------------------------------------------------------------------
// A smoke slab does not shade itself; it asks the shadow map whether the light
// reaches the point it stands at, multiplies that by how much smoke is there,
// and adds the result.  Summing that over fifty-six slices is a crude numerical
// integral along the view ray — which is exactly what a light shaft IS.  The
// shafts are not drawn anywhere; they are what is left over where the light gets
// through, and they bend correctly around the pillars because the shadow map
// already knows about the pillars.
// -----------------------------------------------------------------------
layout(location = 0) out vec4 outAccum;
layout(location = 1) out vec4 outReveal;

in vec3  vObj;
in vec3  vNormal;
in vec3  vView;
in vec3  vWorld;
in float vKind;
in float vExtra;

uniform sampler2D tex0;
uniform sampler2DShadow texShadow;
uniform mat4  lightM;
uniform vec3  lightDir;
uniform float shadowPass;
uniform float shadowTexel;
uniform float shadowExtent;
uniform float oitPass;
uniform float interpolation;
uniform float time;
uniform vec2  nearFar;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioHigh;
uniform float audioKick;
uniform float audioSubBass;
uniform float audioChromaHue;
uniform float audioAmbient;
uniform float audioAdvance;

uniform float densityP;
uniform float glowP;
uniform float hueP;

vec3 hue2rgb(float h)
{
    return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}

float hash13(vec3 p)
{
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float vnoise(vec3 x)
{
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash13(i + vec3(0, 0, 0)), hash13(i + vec3(1, 0, 0)), f.x),
                   mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x),
                   mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

float fbm(vec3 p)
{
    return 0.55 * vnoise(p) + 0.28 * vnoise(p * 2.03) + 0.17 * vnoise(p * 4.11);
}

float shadowAt(vec3 world, float ndl)
{
    float lift = (2.0 * shadowExtent * shadowTexel) * 2.0 / max(ndl, 0.20);
    vec4 lp = lightM * vec4(world + vec3(0.0, lift, 0.0), 1.0);
    vec3 proj = lp.xyz / lp.w * 0.5 + 0.5;
    if (proj.z > 1.0 || any(lessThan(proj.xy, vec2(0.0))) ||
        any(greaterThan(proj.xy, vec2(1.0))))
        return 1.0;
    float bias = 0.0008 + 0.0030 * (1.0 - ndl);
    float s = 0.0;
    float r = shadowTexel * 1.5;
    for (int y = -1; y <= 1; ++y)
        for (int x = -1; x <= 1; ++x)
            s += texture(texShadow,
                         vec3(proj.xy + vec2(float(x), float(y)) * r, proj.z - bias));
    return s / 9.0;
}

void main()
{
    if (shadowPass > 0.5)
    {
        outAccum = vec4(0.0);
        outReveal = vec4(0.0);
        return;
    }

    vec3 L = normalize(lightDir);

    if (oitPass < 0.5)
    {
        // ---- the hall ----
        vec3 n = normalize(vNormal);
        vec3 V = normalize(vView);
        if (dot(n, V) < 0.0) n = -n;

        float ndl = max(dot(n, L), 0.0);
        float sh = mix(0.30, 1.0, shadowAt(vWorld, ndl));

        // Floor, pillar and beam are the same stone at different values; the
        // floor is darker so the shafts landing on it have something to read
        // against.
        float mat = vExtra;
        // The floor is the second half of the effect: the same beams that stripe
        // the smoke also stripe the ground, and those two patterns are the same
        // pattern seen twice.  It has to be bright enough to show them.
        vec3 stone = mix(vec3(0.30, 0.29, 0.30),
                         vec3(0.38, 0.36, 0.34), step(0.5, mat));
        vec3 col = stone * (0.30 + 1.60 * ndl * sh);
        col += stone * 0.70 * (0.4 + 0.8 * audioAmbient);

        // A cold bounce so the shadowed sides are not simply flat black.
        col += stone * vec3(0.30, 0.42, 0.62) * max(-dot(n, L) * 0.4 + 0.35, 0.0) * 0.5;
        col *= 1.0 + 0.12 * audioBeat;
        col = col / (1.0 + col * 0.30);
        outAccum  = vec4(col, interpolation);
        outReveal = vec4(0.0);
        return;
    }

    // ---- smoke ----
    // The smoke lives inside the colonnade and nowhere else.  Without this the
    // slabs carry haze out past the pillars and past the edge of the shadow box,
    // and the frame turns into an even grey with the architecture buried in it.
    if (abs(vWorld.x) > 15.0 || vWorld.y < -0.2 || vWorld.y > 9.2)
        discard;

    // Drift rises and rolls down the hall.  It rides audioAdvance, never
    // absolute time scaled by a live level, or the whole volume would jump
    // every time the music got louder.
    vec3 q = vWorld * 0.36 + vec3(0.0, -audioAdvance * 0.22, -audioAdvance * 0.10);
    float d = fbm(q);
    d = smoothstep(0.42, 0.92, d);

    // Denser low down, thinning toward the roof, and thinning again far away so
    // the corridor does not simply fog over into a grey wall.
    float hFall = exp(-max(vWorld.y, 0.0) * 0.22);
    float far = 1.0 - smoothstep(0.55, 1.0, vExtra);
    float dens = d * hFall * far * clamp(densityP, 0.2, 2.0)
               * (0.55 + 0.45 * audioLevel);

    if (dens < 0.004)
        discard;

    // The only thing that lights the smoke: does the beam reach this slice?
    float lit = shadowAt(vWorld, 1.0);

    float hue = fract(0.10 + 0.30 * hueP + 0.05 * vWorld.y
                      + 0.05 * sin(audioChromaHue));
    vec3 beam = mix(vec3(1.0, 0.94, 0.80), hue2rgb(hue), 0.30);

    vec3 col = beam * lit * (0.30 + 0.55 * glowP)
             * (0.5 + 0.8 * audioKick + 0.35 * audioSubBass);
    // A little ambient scatter so unlit smoke is a presence, not a hole.
    col += vec3(0.05, 0.06, 0.09) * (0.6 + 1.0 * audioAmbient);

    // Tone-map before accumulating: fifty-six slices into an RGBA16F target
    // with a weight in the hundreds is exactly the case that overflows half
    // precision and comes back as black.
    col = col / (1.0 + col * 0.30);

    // Per-SLICE opacity, and there are fifty-six of them.  The number that
    // matters is the product: (1 - a)^56 is the light left at the far end, so
    // a = 0.035 leaves about 13% and reads as thick smoke, while the 0.16 this
    // started at leaves 10^-9 — the volume goes fully opaque a few slices in and
    // its average colour simply replaces the frame.
    float alpha = clamp(dens * 0.018, 0.0, 0.045);

    // A FLAT weight, unlike every other OIT scene here — and this is the whole
    // reason the shafts read.  The depth-falling weight exists to make nearer
    // surfaces dominate, standing in for the sort that is not happening.  A
    // participating medium has no such ordering: every slice along the ray
    // contributes equally to the integral.  Weight the near slabs more and the
    // resolve stops averaging the volume and instead shows you the shadow
    // pattern of whichever slice happens to be closest — coarse blobs where
    // there should be beams.
    float w = alpha * 40.0;

    outAccum  = vec4(col * alpha, alpha) * w;
    outReveal = vec4(alpha);
}
