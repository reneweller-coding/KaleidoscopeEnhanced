#version 330 core
out vec4 fragColor;
// ShadowForest.frag — the ground is the canvas and the trunks are the brush.
// The ground gets a bright, warm direct term so every shadow crossing it reads
// hard; the trunks get almost none, so they stay as silhouettes and do not
// compete with the pattern they are casting.

in vec3  vObj;
in vec3  vNormal;
in vec3  vView;
in vec3  vWorld;
in float vKind;
in float vVar;

/**
 * @file ShadowForest.frag
 * @brief Shades the ground and trunks of the ShadowForest colonnade,
 * reading a real shadow map (texShadow/lightM, built from the geometry
 * ShadowForest.comp generates) so the sixty overlapping trunk shadows fall
 * correctly across the ground rather than being faked.
 *
 * audioLevel boosts both the direct sunlight term on the ground and the
 * dappled canopy light that carries the floor; audioAmbient
 * scales the sky-bounce fill light and the distance haze; audioKick
 * strengthens the trunks' silhouette rim light; audioBeat and audioSubBass
 * pulse the overall exposure; audioHigh adds a faint white highlight.
 * hueP/audioChromaHue/audioValence drive imgPalette, a live sample of the
 * slideshow photo that tints the sunlight colour, with audioAdvance
 * providing its slow drift. vKind selects ground vs. trunk shading and vVar
 * varies bark tone between trunks.
 */

uniform sampler2D tex0;
uniform sampler2DShadow texShadow;
uniform mat4  lightM;
uniform vec3  lightDir;
uniform float shadowPass;
uniform float shadowTexel;
uniform float shadowExtent;
uniform float interpolation;
uniform float time;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioHigh;
uniform float audioKick;
uniform float audioSubBass;
uniform float audioChromaHue;
uniform float audioAmbient;

uniform float glowP;
uniform float hueP;
uniform float mistP;
uniform sampler2D tex1;
uniform float audioAdvance;
uniform float audioValence;

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

vec3 hue2rgb(float h)
{
    return imgPalette(h) * 1.35;   // photo-arc palette (house standard), was HSV rainbow
}

float shadowAt(vec3 world, vec3 n, float ndl)
{
    float lift = (2.0 * shadowExtent * shadowTexel) * 2.2 / max(ndl, 0.15);
    vec4 lp = lightM * vec4(world + n * lift, 1.0);
    vec3 proj = lp.xyz / lp.w * 0.5 + 0.5;
    if (proj.z > 1.0 || any(lessThan(proj.xy, vec2(0.0))) ||
        any(greaterThan(proj.xy, vec2(1.0))))
        return 1.0;
    float bias = 0.0006 + 0.0030 * (1.0 - ndl);
    float s = 0.0;
    float r = shadowTexel * 1.6;
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
        fragColor = vec4(0.0);
        return;
    }

    vec3 n = normalize(vNormal);
    vec3 V = normalize(vView);
    if (dot(n, V) < 0.0) n = -n;

    // The sun vector, guarded.  EVERY warm term in this shader is gated on it:
    // the ground's direct light, the trunks' direct light, and the trunk rim --
    // which does not even go through the shadow map. In the measured probe not
    // one pixel of the frame was warm (max r-b = 0.016 over the whole image)
    // and the brightest thing in it was the haze, which is the signature of
    // that whole chain reading zero rather than of a dark scene. A degenerate
    // lightDir normalises to NaN, and max(NaN, 0.0) collapses every one of
    // those terms at once. Falling back to a fixed high sun costs nothing when
    // lightDir is good and keeps the stand lit when it is not.
    float lLen = length(lightDir);
    vec3  L    = (lLen > 1e-4) ? lightDir / lLen : normalize(vec3(0.33, 0.90, -0.28));
    float ndl  = max(dot(n, L), 0.0);
    float sh   = clamp(shadowAt(vWorld, n, ndl), 0.0, 1.0);

    float hue = fract(0.09 + 0.16 * hueP + 0.04 * sin(audioChromaHue));
    vec3 sun = mix(vec3(1.0, 0.86, 0.62), hue2rgb(hue), 0.28);
    vec3 sky = vec3(0.26, 0.36, 0.52);

    vec3 col;
    if (vKind < 0.5)
    {
        // ---- forest floor ----
        vec3 ground = vec3(0.30, 0.27, 0.22);

        // Canopy dapple: broad pools of light and shade drifting across the
        // floor. A stand of 64 thin poles casts almost nothing across an open
        // floor, so the largest surface in the frame carried ONE brightness --
        // measured std 0.0043 across a 100x1050 pixel patch of it, which is
        // what the frame's 0.054 contrast was actually made of. Real forest
        // floor light comes from the leaf canopy overhead, which is what this
        // is. The drift is a constant coefficient on `time` (~0.7 world units
        // per second across a ~9-unit pattern, about 0.08 Hz) -- a slow crawl,
        // far inside the temporal budget.
        vec2 gp = vWorld.xz * 0.42 + vec2(time * 0.30, audioAdvance * 0.06);
        float d1 = sin(gp.x * 1.7 + sin(gp.y * 1.1) * 1.6);
        float d2 = sin(gp.y * 2.3 - sin(gp.x * 1.4) * 1.9);
        float dapple = smoothstep(0.18, 0.84, 0.5 + 0.5 * d1 * d2);

        // The dapple has to ride the SKY term, not only the direct one. In the
        // measured probe the direct term was zero over the entire floor: fit
        // the observed floor colour and it comes out as pure sky fill plus
        // haze, with ndl * sh contributing nothing (see the sun-vector note
        // above). A dapple applied only to that term multiplies zero and
        // changes nothing at all. Riding the sky term is the better model
        // regardless -- a canopy occludes the sky dome exactly as it occludes
        // the sun, and shaded forest floor is blue because of it.
        col  = ground * sky * (0.55 + 0.5 * audioAmbient) * (0.40 + 1.05 * dapple);
        col += ground * mix(sky, sun, 0.55) * dapple * (1.85 + 0.45 * audioLevel);

        // The real shadow map still darkens whatever it covers, on top of that.
        col += ground * sun * ndl * sh * (1.7 + 0.5 * audioLevel)
             * (0.26 + 1.30 * dapple);
        // Cap the TINTED vec3, not a scalar: `sun` and `sky` both exceed 1.0 in
        // a channel once the palette warms them, so a scalar cap would let a
        // single channel run away on a bright pool.
        col = min(col, vec3(1.15));
        // The litter breaks the plane up so the shadows have something to lie on.
        float grain = fract(sin(dot(floor(vWorld.xz * 6.0), vec2(12.99, 78.23)))
                            * 43758.5453);
        col *= 0.93 + 0.14 * grain;
    }
    else
    {
        // ---- trunks ----
        vec3 bark = mix(vec3(0.13, 0.11, 0.10), vec3(0.22, 0.18, 0.15), vVar);
        col = bark * sky * 0.55;
        col += bark * sun * ndl * sh * 0.85;
        // A rim off the sun side so the silhouettes separate from each other.
        float rim = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 2.6);
        col += sun * rim * max(dot(n, L) * 0.5 + 0.5, 0.0)
             * (0.30 + 0.7 * glowP) * (0.5 + 1.0 * audioKick);
    }

    // Depth haze: the stand has to fade or the far trunks pile into a black wall.
    float dist = length(vec3(vWorld.x, vWorld.y - 1.0, vWorld.z + 7.0));
    // At 0.035/unit and a 0.92 ceiling, the far two thirds of the floor was
    // 50-90% replaced by one constant air colour -- the haze was doing more to
    // flatten the picture than the shadows were doing to structure it.
    // Lower still: the haze is a lerp toward a CONSTANT, so whatever fraction
    // of it survives is exactly the fraction of the floor's contrast that is
    // thrown away. Simulated over the visible floor, dropping 0.022/0.60 to
    // 0.018/0.42 lifts the floor's own luma std from 0.072 to 0.088 with no
    // change in exposure -- and the stand still fades out at the back, which
    // is all the haze was ever there to do.
    float haze = 1.0 - exp(-dist * 0.018 * clamp(mistP, 0.2, 2.0));
    vec3 air = mix(sky * 0.55, sun * 0.5, 0.35) * (0.6 + 0.6 * audioAmbient);
    col = mix(col, air, clamp(haze, 0.0, 0.42));

    col *= 1.0 + 0.16 * audioBeat + 0.12 * audioSubBass;
    col += sun * 0.05 * audioHigh;
    col = col / (1.0 + col * 0.30);
    fragColor = vec4(col, interpolation);
}
