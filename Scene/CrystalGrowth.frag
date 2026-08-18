#version 330 core
out vec4 fragColor;
// CrystalGrowth.frag — frost growing across the frame by diffusion-limited
// aggregation (Blend/CfxCrystal.comp).  The field stores solid/hue only; the
// growth FRONT is found here geometrically — a solid texel with few solid
// neighbours is a tip, and tips are what glow.

uniform sampler2D tex0;
uniform sampler2D texCrystal;    // <- requests the DLA sim
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
uniform float sharpP;
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

float solidAt(vec2 uv) { return texture(texCrystal, uv).r; }

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    vec4 fld = texture(texCrystal, uv);
    float solid = fld.r;
    float hue   = fld.b;

    vec2 px = 1.0 / resolution;

    // Tip detection: how much of the neighbourhood is NOT frozen.
    float n = 0.0;
    for (int i = 0; i < 8; ++i)
    {
        float a = float(i) * 0.7854;
        n += solidAt(uv + vec2(cos(a), sin(a)) * px * 2.5);
    }
    float exposed = 1.0 - n / 8.0;
    float tip = solid * smoothstep(0.25, 0.85, exposed);

    // Soft halo so the crystal sits in a cold mist rather than on black.
    float halo = 0.0;
    float r = 0.004 + 0.010 * glowP;
    for (int i = 0; i < 8; ++i)
    {
        float a = float(i) * 0.7854 + 0.4;
        halo += solidAt(uv + vec2(cos(a), sin(a)) * r);
    }
    halo /= 8.0;

    // Frost palette: cold body, hot rim.  Bounded hue nudge from the music.
    vec3 body = imgPalette(0.58 + hue * 0.12 + 0.056 * sin(audioChromaHue)) * 1.35;
    body = mix(vec3(0.55, 0.72, 0.95), body, 0.45);

    vec3 col = body * solid * (0.30 + 0.35 * audioLevel);
    col += body * halo * (0.22 + 0.30 * glowP);
    // The growth front sparkles with the treble — that is where new crystal
    // is actually being deposited this frame.
    col += vec3(0.85, 0.95, 1.20) * tip
           * (0.9 + 2.4 * audioHigh + 1.5 * audioKick) * (0.5 + sharpP);

    // The photo shows through the un-frozen glass, dimmed and cooled.
    vec3 photo = texture(tex0, uv).rgb;
    float clear = 1.0 - clamp(solid + halo * 0.8, 0.0, 1.0);
    col += photo * photo * clear * (0.10 + 0.16 * audioAmbient);

    col = col / (1.0 + col * 0.35);
    fragColor = vec4(col, interpolation);
}
