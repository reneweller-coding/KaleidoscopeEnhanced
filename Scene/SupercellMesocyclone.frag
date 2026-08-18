#version 330 core
out vec4 fragColor;
// SupercellMesocyclone.frag
// -----------------------------------------------------------------------
// SUPERCELL MESOCYCLONE: Volumetric rotating supercell storm cloud with
// helical updraft mesocyclone, lowering wall cloud, anvil overhang,
// crepuscular god rays, and audio-reactive intracloud lightning illumination.
//   audioAdvance -> rotates mesocyclone cloud tiers & anvil shear
//   audioKick    -> flashes branched intracloud lightning & illuminates storm
//   audioBass    -> undulates cloud density and storm pressure depression
//   audioCentroid-> shifts sunset backlighting color temperature
//
// Per-activation variety:
//   cloudP float cloud density & vortex tiering       (0.5..2.2)
//   stormP float lightning flash & turbulence scale   (0.5..2.0)
//   speedP float storm rotation velocity             (0.5..2.0)
//   hueP   float atmospheric sky hue offset          (0..6.28)
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;
uniform float audioChromaHue;

uniform float cloudP;
uniform float stormP;
uniform float speedP;
uniform float hueP;

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

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

// 2D Noise helper
float hash21(vec2 p) {
    p = fract(p * vec2(354.34, 625.21));
    p += dot(p, p + 23.32);
    return fract(p.x * p.y);
}

float noise2D(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash21(i + vec2(0.0, 0.0)), hash21(i + vec2(1.0, 0.0)), u.x),
        mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
        u.y
    );
}

float cloudFBM(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 5; ++i) {
        v += a * noise2D(p);
        p = rot * p * 2.0 + vec2(10.0);
        a *= 0.5;
    }
    return v;
}

void main() {
    float cld = (cloudP > 0.0) ? cloudP : 1.0;
    float stm = (stormP > 0.0) ? stormP : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.3 * spd + audioAdvance * 0.15;

    // Mesocyclone polar coordinates
    vec2 center = vec2(sin(t * 0.4) * 0.1, -0.1);
    vec2 rel = uv - center;
    float r = length(rel);
    float angle = atan(rel.y, rel.x);

    // Helical spiraling vortex bands
    float spiral = angle * 3.0 + log(max(r, 0.01)) * 6.0 - t * 2.5;
    vec2 rotCoord = vec2(cos(spiral) * r, sin(spiral) * r);

    // Multi-tier cloud density
    float clouds = cloudFBM(rotCoord * 3.5 * cld + vec2(t * 0.2, 0.0));
    clouds = smoothstep(0.25, 0.75, clouds);

    // Wall cloud lowering at the core
    float wallCloud = exp(-r * 6.0) * (1.0 + 0.3 * audioBass);

    // Intracloud lightning flash on kick
    float lightningFlash = pow(cloudFBM(uv * 10.0 + t * 4.0), 3.0) * (audioKick * 4.5 * stm + audioHigh * 1.5);
    float ambientLightning = (audioKick > 0.6) ? 0.8 : 0.0;

    // Photo texture mapping into storm cloud layers
    vec2 photoUV = st + vec2(sin(spiral), cos(spiral)) * 0.03 * (1.0 + audioKick * 0.5);
    vec3 photo = img(fract(photoUV));

    // Dramatic sunset storm sky palette (deep indigo, bruised violet, amber anvil rim)
    vec3 skyBase = mix(vec3(0.04, 0.05, 0.1), vec3(0.12, 0.08, 0.16), uv.y + 0.5);
    vec3 cloudColor = imgPalette(0.10 + 0.25 * clamp(uv.y * 1.5 + 0.5, 0.0, 1.0)) * 1.1;
    vec3 lightningColor = vec3(0.9, 0.95, 1.0);

    // Combine visualizer
    vec3 col = mix(skyBase, photo * 0.8, 0.35 + 0.2 * audioLevel);
    col = mix(col, cloudColor, clouds * (0.8 + 0.2 * audioSwell));
    col += wallCloud * vec3(0.08, 0.05, 0.12);
    col += (lightningFlash + ambientLightning) * lightningColor;

    if (audioChromaHue != 0.0)     if (hue > 0.001) col = hueRot(col, hue);

    // Vignette
    float vig = smoothstep(1.35, 0.35, length(uv));
    col *= vig;

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (col) * 0.32;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
