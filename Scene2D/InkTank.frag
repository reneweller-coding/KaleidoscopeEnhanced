#version 330 core
out vec4 fragColor;
// InkTank.frag — dye in a REAL fluid.  Unlike the older curl-noise Fluid
// (divergence-free by construction, so it can only ever swirl), the solver
// behind texNSFluid advects, then solves the pressure Poisson equation and
// subtracts its gradient — which is what lets it shed vortices off the jet
// and push back against the walls.
//
// texNSFluid: RGB = dye, A = speed.

uniform sampler2D tex0;
uniform sampler2D texNSFluid;    // <- requests the Navier-Stokes sim
uniform vec2  resolution;
uniform float time;
uniform float interpolation;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioHigh;
uniform float audioChromaHue;
uniform float audioAmbient;

uniform float glowP;
uniform float inkP;
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

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 px = 1.0 / resolution;

    vec4 f = texture(texNSFluid, uv);
    vec3 dye = f.rgb;
    float speed = f.a;

    // Schlieren-style edge: the gradient of the dye density makes the
    // filaments read as sharp sheets rather than a soft cloud.
    float gx = dot(texture(texNSFluid, uv + vec2(px.x * 2.0, 0.0)).rgb
                 - texture(texNSFluid, uv - vec2(px.x * 2.0, 0.0)).rgb, vec3(0.33));
    float gy = dot(texture(texNSFluid, uv + vec2(0.0, px.y * 2.0)).rgb
                 - texture(texNSFluid, uv - vec2(0.0, px.y * 2.0)).rgb, vec3(0.33));
    float edge = length(vec2(gx, gy)) * 9.0;

    vec3 col = dye * (1.6 + 1.1 * inkP)
             + img(uv) * 0.14;   // dim picture ghost — tank never pure black

    // Fast fluid glows: speed is the solver's own output, so the highlights
    // sit exactly on the shear layers where the vortices are being born.
    vec3 hot = imgPalette(0.15) * 1.35;
    col += hot * clamp(speed, 0.0, 2.0) * (0.10 + 0.22 * glowP)
           * (0.6 + 0.8 * audioLevel);

    col += vec3(edge) * (0.18 + 0.30 * glowP) * (0.5 + audioHigh);

    // Halo
    vec3 soft = vec3(0.0);
    float r = 0.005 + 0.010 * glowP;
    for (int i = 0; i < 6; ++i)
    {
        float a = float(i) * 1.0472;
        soft += texture(texNSFluid, uv + vec2(cos(a), sin(a)) * r).rgb;
    }
    col += soft / 6.0 * 0.30 * (1.0 + audioKick);

    // The tank itself: a very dark version of the photo behind the ink.
    vec3 photo = texture(tex0, uv).rgb;
    float cover = clamp(dot(col, vec3(0.4)), 0.0, 1.0);
    col += photo * photo * (0.05 + 0.10 * audioAmbient) * (1.0 - cover);

    col = col / (1.0 + col * 0.32);
    fragColor = vec4(col, interpolation);
}
