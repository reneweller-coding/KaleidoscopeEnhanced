#version 330 core
out vec4 fragColor;
// FluidSim.frag
// -----------------------------------------------------------------------
// GPU "ink" simulation step: an RGB dye field is advected semi-Lagrangian
// along the CURL of a noise potential.  A curl field is divergence-free by
// construction, so the dye flows like an incompressible fluid (smoke / ink
// in water) WITHOUT a pressure solve — one texture, one pass, runs on any
// iGPU.  The source image is continuously injected as fresh dye, so the
// picture itself becomes the ink that swirls, folds and dissolves.
//
// Driven by FilterShader::stepFluid():
//   flowPhase = integrated (time + audioAdvance) -> jump-free evolution
//   impulse   = slew-limited bass/beat -> stronger swirl on heavy passages
//   injectAmt = dye refresh rate (onsets pour in extra ink)
//   seedMode 1 -> first frame: initialise the dye with the image
// -----------------------------------------------------------------------

uniform sampler2D texPrev;   // dye state (RGB)
uniform sampler2D tex0;      // source images
uniform sampler2D tex1;
uniform float interpolation;
uniform vec2  resolution;    // sim grid size
uniform float seedMode;
uniform float flowPhase;
uniform float impulse;
uniform float injectAmt;

vec3 img(vec2 uv) { return (interpolation * texture(tex0, uv)
                          + (1.0 - interpolation) * texture(tex1, uv)).rgb; }

float hash21(vec2 p)
{
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
}
float vnoise(vec2 p)
{
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Noise potential (2 octaves, drifting with the integrated flow phase).
float psi(vec2 p)
{
    return vnoise(p * 3.0 + vec2(0.0, flowPhase))
         + 0.5 * vnoise(p * 6.0 + vec2(3.7, -flowPhase * 0.7));
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;

    if (seedMode > 0.5)
    {
        fragColor = vec4(img(uv), 1.0);
        return;
    }

    // Velocity = curl of the potential (finite differences): rotate the
    // gradient 90 degrees -> divergence-free swirl field.
    float e = 2.0 / resolution.x;
    float dx = psi(uv + vec2(e, 0.0)) - psi(uv - vec2(e, 0.0));
    float dy = psi(uv + vec2(0.0, e)) - psi(uv - vec2(0.0, e));
    vec2 vel = vec2(dy, -dx) / (2.0 * e);

    // Semi-Lagrangian advection: fetch the dye from where it came from.
    // (Magnitude capped so noise-gradient spikes can't teleport the ink.)
    float mag  = min(length(vel), 3.0);
    vec2  vdir = vel / max(length(vel), 1e-4);
    vec2  disp = vdir * mag * (0.0012 + 0.0016 * impulse);
    vec3  dye  = texture(texPrev, uv - disp).rgb;

    // Slow fade + continuous image injection: the picture is the ink source,
    // so the field stays recognisably image-coloured while it swirls.
    dye *= 0.996;
    dye  = mix(dye, img(uv), clamp(injectAmt, 0.0, 0.2));

    fragColor = vec4(dye, 1.0);
}
