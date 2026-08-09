#version 120
// VolumetricFire.frag — companion to VolumetricFire.vert.  Samples the live
// GPU fire/smoke simulation (Blend/Smoke3DSim.frag, R=temperature,
// G=density) at this depth-slice billboard's atlas cell and maps it through
// a classic black -> red -> orange -> yellow -> white-hot ramp, with a grey
// smoke haze wherever density outlives the heat (the rising column above the
// flame tip).  Additive blending (see Scene3DShader::draw) makes the 20
// stacked depth-slices sum into one soft volumetric column — no alpha
// blending or depth sorting needed, so slice draw order never matters.

uniform sampler2D texSmoke3D;

varying vec2  vAtlasUV;
varying float vHeightFrac;
varying float vHue;
varying float vGlow;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    vec4  sim  = texture2D(texSmoke3D, vAtlasUV);
    float temp = sim.r;
    float dens = sim.g;

    // Fire ramp: ember -> flame -> white-hot core.
    vec3 fire = mix(vec3(0.09, 0.01, 0.0), vec3(1.0, 0.35, 0.03), clamp(temp * 1.1, 0.0, 1.0));
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
    gl_FragColor = vec4(col * bright, 1.0);
}
