#version 330 core
out vec4 fragColor;
// PillarHall.frag — the shading half of the shadow-map contract.
// -----------------------------------------------------------------------
// texShadow is declared with sampler2DShadow, not sampler2D.  That is the
// whole trick behind soft edges here: with GL_TEXTURE_COMPARE_MODE set, the
// hardware compares each of the four texels a LINEAR filter would fetch and
// then averages the four BOOLEANS.  A plain sampler2D would average the depths
// first and compare once, which is not the same thing at all — it produces a
// hard edge with a halo, not a soft one.
//
// The other half of the contract: during the depth pass this shader must
// return immediately.  It would otherwise sample the very texture it is
// currently rendering into, which is undefined.

in vec3  vWorld;
in vec3  vNormal;
in float vKind;
in float vTint;
in float vHeight;

uniform sampler2D tex0;
uniform sampler2DShadow texShadow;
uniform mat4  lightM;
uniform vec3  lightDir;
uniform float shadowPass;
uniform float shadowTexel;
uniform float interpolation;
uniform float time;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioHigh;
uniform float audioSubBass;
uniform float audioChromaHue;
uniform float audioAmbient;

uniform float camHP;
uniform float softP;
uniform float hueP;

vec3 hue2rgb(float h)
{
    return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}

// One shadow texel, in world units.  Derived rather than hardcoded, because
// the light's box is sized per scene now — a constant here would silently
// under- or over-bias every scene whose scale differs from this one's.
uniform float shadowExtent;
#define SHADOW_WORLD_TEXEL (2.0 * shadowExtent * shadowTexel)

float shadowAt(vec3 world, vec3 n, float ndl)
{
    // Normal offset.  A shadow texel covers a patch of surface, and the depth
    // recorded for that patch is one single value — so a surface almost always
    // ties with its own record and shadows itself in stripes.  Lifting the
    // lookup off the surface along its normal moves the query clear of the
    // patch entirely, and unlike a depth bias it works the same on every
    // orientation and needs no knowledge of the geometry's winding.
    float lift = SHADOW_WORLD_TEXEL * 2.2 / max(ndl, 0.15);
    vec4 lp = lightM * vec4(world + n * lift, 1.0);
    vec3 proj = lp.xyz / lp.w * 0.5 + 0.5;      // clip space -> texture space
    if (proj.z > 1.0)
        return 1.0;                             // beyond the light's far plane

    // A small slope-scaled depth bias on top, for the grazing angles where even
    // the normal offset leaves a sliver.
    float bias = 0.0006 + 0.0030 * (1.0 - ndl);

    // 3x3 taps on top of the hardware's own 2x2 comparison filter.
    float s = 0.0;
    float r = shadowTexel * (0.8 + 2.6 * softP);
    for (int y = -1; y <= 1; ++y)
        for (int x = -1; x <= 1; ++x)
            s += texture(texShadow,
                         vec3(proj.xy + vec2(float(x), float(y)) * r,
                              proj.z - bias));
    return s / 9.0;
}

void main()
{
    // Depth pass: write nothing but depth.
    if (shadowPass > 0.5)
    {
        fragColor = vec4(0.0);
        return;
    }

    vec3 n = normalize(vNormal);
    vec3 V = normalize(vec3(0.0, camHP, 0.0) - vWorld);
    vec3 L = normalize(lightDir);

    float ndl = max(dot(n, L), 0.0);
    float shadow = shadowAt(vWorld, n, ndl);

    float hue = fract(0.58 + 0.22 * hueP + 0.10 * vTint + 0.05 * sin(audioChromaHue));
    // The floor is deliberately the brightest surface in the scene: it is what
    // the shadows are drawn ON, and a dark floor hides the very thing the
    // second render pass exists to produce.
    vec3 base = (vKind < 0.5)
              ? vec3(0.30, 0.31, 0.34)                          // floor
              : mix(vec3(0.11, 0.115, 0.135), hue2rgb(hue), 0.30 + 0.35 * hueP);

    // Sun: warm, and the only thing the shadow term touches.
    vec3 sun = vec3(1.0, 0.90, 0.72) * (1.5 + 1.4 * audioLevel);
    vec3 col = base * sun * ndl * shadow;

    // Sky ambient from above, unshadowed — an occlusion term is what darkens
    // the shadowed areas, not the absence of any light at all.  Killing the
    // ambient too turns every shadow into a hole.
    vec3 sky = vec3(0.30, 0.40, 0.62) * (0.30 + 0.35 * audioAmbient);
    col += base * sky * (0.45 + 0.55 * max(n.y, 0.0));

    // A bounce off the floor, so pillar sides facing down are not dead.
    col += base * vec3(0.22, 0.20, 0.18) * max(-n.y, 0.0) * 0.5;

    // Emissive band climbing the pillars on the kick.
    if (vKind > 0.5)
    {
        float band = fract(vHeight * 1.2 - time * 0.30);
        col += hue2rgb(fract(hue + 0.5))
             * pow(max(1.0 - abs(band - 0.5) * 7.0, 0.0), 3.0)
             * (0.25 + 1.5 * audioKick) * 1.2;
    }

    vec3 H = normalize(L + V);
    col += vec3(1.0, 0.95, 0.85) * pow(max(dot(n, H), 0.0), 60.0)
         * shadow * (0.3 + 1.6 * audioHigh);

    // Distance haze so the hall recedes.
    float haze = clamp(vWorld.z / 190.0, 0.0, 1.0);
    col = mix(col, vec3(0.10, 0.13, 0.20) * (1.0 + 0.6 * audioAmbient),
              pow(haze, 1.4));

    col *= 1.0 + 0.16 * audioBeat + 0.12 * audioSubBass;
    col = col / (1.0 + col * 0.26);
    fragColor = vec4(col, interpolation);
}
