#version 330 core
out vec4 fragColor;
// VolumetricFire.frag — companion to VolumetricFire.vert.  Samples the live
// GPU fire/smoke simulation (Blend/Smoke3DSim.frag, R=temperature,
// G=density) at this depth-slice billboard's atlas cell and maps it through
// a classic black -> red -> orange -> yellow -> white-hot ramp, with a grey
// smoke haze wherever density outlives the heat (the rising column above the
// flame tip).  Additive blending (see Scene3DShader::draw) makes the 20
// stacked depth-slices sum into one soft volumetric column — no alpha
// blending or depth sorting needed, so slice draw order never matters.

uniform sampler2D texSmoke3D;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float audioAdvance;
uniform float audioValence;
uniform float audioChromaHue;

in vec2  vAtlasUV;
in float vHeightFrac;
in float vHue;
in float vGlow;

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


// House tint: bend a colour toward the photo palette while keeping its
// luminance -- the identity look survives, only the hue follows the photos.
vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
}
vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

uniform float time;
uniform float audioKick;

float fhash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float fnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(fhash(i), fhash(i + vec2(1, 0)), f.x),
               mix(fhash(i + vec2(0, 1)), fhash(i + vec2(1, 1)), f.x), f.y);
}

void main()
{
    vec4  sim  = texture(texSmoke3D, vAtlasUV);
    float temp = sim.r;
    float dens = sim.g;

    // FALLBACK: when the smoke sim texture is absent/black (probe renders,
    // sim unit disabled), synthesize a procedural flame so the scene NEVER
    // shows an empty frame.  Four atlas taps decide whether the sim lives.
    float simAlive = texture(texSmoke3D, vec2(0.1, 0.6)).r
                   + texture(texSmoke3D, vec2(0.5, 0.4)).r
                   + texture(texSmoke3D, vec2(0.9, 0.6)).r
                   + texture(texSmoke3D, vec2(0.3, 0.2)).g;
    if (simAlive < 0.01)
    {
        float lx = fract(vAtlasUV.x * 5.0);        // local slice x (0..1)
        float v  = vHeightFrac;
        float flick = fnoise(vec2(lx * 4.0, v * 5.0 - time * 2.2))
                    * 0.65 + fnoise(vec2(lx * 9.0 + 7.0, v * 11.0 - time * 4.0)) * 0.35;
        float core = 1.0 - abs(lx - 0.5) * (3.2 + 4.6 * v);   // narrowing tongue
        temp = clamp(core, 0.0, 1.0) * (1.0 - v * 0.8) * (0.85 + 0.75 * flick)
             * (1.1 + 0.5 * audioKick);
        // 20 slices ADD, so each contributes a twentieth of the column
        temp = max(temp - 0.18, 0.0) * 0.26;
        dens = clamp(temp * 0.5 + flick * 0.10 * (1.0 - v * 0.4), 0.0, 0.4);
    }

    // Fire ramp: ember -> flame -> white-hot core.
    vec3 fire = palTint(mix(vec3(0.09, 0.01, 0.0), vec3(1.0, 0.35, 0.03), clamp(temp * 1.1, 0.0, 1.0)), 0.06 * clamp(temp * 1.1, 0.0, 1.0), 0.18);
    fire      = mix(fire, vec3(1.0, 0.85, 0.35), clamp((temp - 0.55) * 1.6, 0.0, 1.0));
    fire      = mix(fire, vec3(1.3, 1.25, 1.05), clamp((temp - 1.15) * 2.0, 0.0, 1.0));

    // Smoke haze: only where density lingers after the heat has cooled away
    // (the rising column above the visible flame tip).
    vec3 smoke = vec3(0.16, 0.15, 0.15) * clamp(dens - temp * 0.4, 0.0, 1.0);

    vec3 col = fire * clamp(temp, 0.0, 1.6) + smoke * 0.55;
    // vHue (audioChromaHue) carries a large per-activation offset (up to a
    // full turn) by design elsewhere in the engine -- sin() bounds it to a
    // small +-tint wobble instead of a wide hue swing, so this stays looking
    // like FIRE rather than randomly drifting green/blue/purple.
    col = hueRot(col, sin(vHue) * 0.07);

    // Crackling sparks: tiny white-hot pops flickering inside the hot core
    // (hash-gated per screen cell -> lively, not a uniform glow).
    vec2  cell = floor(gl_FragCoord.xy / 3.0);
    float spark = step(0.985, fract(sin(dot(cell, vec2(12.9898, 78.233))
                                        + floor(vHeightFrac * 40.0)) * 43758.5453));
    col += vec3(1.3, 1.1, 0.8) * spark * clamp(temp - 0.5, 0.0, 1.0) * 2.0;

    float bright = clamp(temp * 1.15 + dens * 0.45, 0.0, 3.2) * vGlow;
    fragColor = vec4(col * bright, 1.0);
}
