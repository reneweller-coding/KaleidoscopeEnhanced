#version 330 core
out vec4 fragColor;
/**
 * @file FireWhirlTornado.frag
 * @brief FIRE WHIRL TORNADO: Volumetric 3D rotating fire tornado with helical
 * flame column, turbulent soot/ash advection, rising ember sparks, and
 * blackbody thermal radiation gradient with audio-reactive explosive bursts.
 *   audioAdvance -> accelerates tornado vortex swirl & thermal updraft
 *   audioKick    -> triggers explosive fireball detonations in the core
 *   audioBass    -> widens tornado base and convective vortex reach
 *   audioCentroid-> shifts flame temperature (deep orange to white-hot)
 *
 * Per-activation variety:
 *   tornadoP float fire vortex radius & height         (0.5..2.2)
 *   heatP    float blackbody core thermal radiance    (0.5..2.0)
 *   speedP   float vortex angular rotation speed      (0.5..2.0)
 *   hueP     float thermal chromatic palette offset   (0..6.28)
 */

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

uniform float tornadoP;
uniform float heatP;
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


// House tint: bend a colour toward the photo palette while keeping its
// luminance -- the identity look survives, only the hue follows the photos.
vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
}
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

// 3D Noise for volumetric fire
float hash31(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise3D(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(mix(hash31(i + vec3(0,0,0)), hash31(i + vec3(1,0,0)), f.x),
            mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
        mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
            mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y),
        f.z
    );
}

float fireFBM(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    vec3 shift = vec3(100.0);
    for (int i = 0; i < 4; ++i) {
        v += a * noise3D(p);
        p = p * 2.0 + shift;
        a *= 0.5;
    }
    return v;
}

void main() {
    float trn = (tornadoP > 0.0) ? tornadoP : 1.0;
    float ht  = (heatP    > 0.0) ? heatP    : 1.0;
    float spd = (speedP   > 0.0) ? speedP   : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.45 * spd + audioAdvance * 0.25;

    // Raymarching camera
    vec3 ro = vec3(0.0, -0.2, -2.5);
    vec3 rd = normalize(vec3(uv, 1.2 - 0.25 * audioKick));

    // Volumetric flame raymarch
    vec3 p = ro;
    float accumFlame = 0.0;
    float accumSmoke = 0.0;
    float stepSize = 0.08;

    for (int i = 0; i < 35; ++i) {
        p += rd * stepSize;
        float y = p.y;
        float r = length(p.xz);

        // Tornado funnel profile: r(y) narrows near base, flares at top
        float funnelR = (0.25 + 0.35 * pow(max(y + 1.0, 0.0), 1.2)) * trn + 0.1 * audioBass;

        // Upward vortex motion: theta + y * twist - t
        float theta = atan(p.z, p.x);
        vec3 vortexCoord = vec3(r * 4.0, y * 3.0 - t * 4.0, theta * 2.0 + y * 2.0 - t * 6.0);

        float fbmVal = fireFBM(vortexCoord);

        // Distance to funnel core
        float distToFunnel = abs(r - funnelR * fbmVal);
        float flame = exp(-distToFunnel * 8.0) * exp(-abs(y) * 1.2);
        accumFlame += flame * stepSize;

        // Smoke envelope
        float smoke = exp(-distToFunnel * 3.0) * (1.0 - flame);
        accumSmoke += smoke * stepSize;
    }

    // Photo texture mapping warped by thermal updraft
    vec2 photoWarp = st + vec2(sin(uv.y * 6.0 + t * 2.0), cos(uv.x * 6.0 - t * 2.0)) * 0.04 * (1.0 + audioKick);
    vec3 photo = img(fract(photoWarp));

    // Blackbody thermal flame colors (red -> orange -> yellow -> white-hot)
    vec3 fireColor = palTint(mix(vec3(0.8, 0.15, 0.02), vec3(1.0, 0.65, 0.1), clamp(accumFlame * 1.5, 0.0, 1.0)), 0.08 * clamp(accumFlame * 1.5, 0.0, 1.0), 0.20);
    fireColor = mix(fireColor, vec3(1.0, 0.95, 0.85), clamp(accumFlame * 0.8 * ht + audioKick * 1.5, 0.0, 1.0));

    // Combine visualizer
    vec3 col = mix(photo * 0.7, vec3(0.1, 0.08, 0.08), clamp(accumSmoke * 0.8, 0.0, 1.0));
    col += accumFlame * fireColor * (1.2 + audioSwell * 0.8);

    // Rising ember sparks
    float embers = pow(fireFBM(vec3(uv * 12.0, t * 3.0)), 4.0) * (audioKick * 3.0 + audioHigh * 1.5);
    col += embers * vec3(1.0, 0.8, 0.3) * 2.0;

    if (audioChromaHue != 0.0)     if (hue > 0.001) col = hueRot(col, hue);

    // Vignette
    float vig = smoothstep(1.3, 0.35, length(uv));
    col *= vig;

    fragColor = vec4(col, 1.0);
}
