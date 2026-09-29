#version 330 core
out vec4 fragColor;
/**
 * @file InkTank.frag
 * @brief INK TANK: drops of ink falling through a backlit tank of water, the
 * way the macro photographs show it -- each drop sinks as a vortex ring, its
 * head curling into a mushroom of fine filaments, a thinning stem trailing
 * behind, and the inks (deep blue, magenta, amber, tinted by the photo)
 * absorbing the white back-light where they overlap, so crossings go dark
 * and rich.  New drops enter at the top while old plumes spread and fade.
 *
 * The scene used to shade the compute Navier-Stokes solver; in the real app
 * that showed a grey photo wall with barely any ink (catalogue review
 * 29.09.2026).  This version is analytic and needs no compute pass.
 *
 * Audio Reactivity:
 *   audioSwell   -> the back-light brightens (slow)
 *   audioKick    -> the filament edges catch a glint (light only)
 *   audioLevel   -> overall light
 *   audioChromaHue-> photo tint of the inks
 *   sceneTime / sceneAdvance -> the drops sinking and curling (continuous)
 *
 * Per-activation variety: glowP (edge glint), inkP (ink strength).
 */

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform vec2  resolution;
uniform float time;
uniform float interpolation;

uniform float sceneTime;
uniform float sceneAdvance;
uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioAdvance;
uniform float audioValence;

uniform float glowP;
uniform float inkP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 3.1; a *= 0.5; }
    return v;
}
// Fibres: ridged noise, thin bright lines where the ink is drawn out.
float fibres(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; ++i) { float n = 1.0 - abs(2.0 * noise2(p) - 1.0); v += a * n * n * n; p = mat2(1.6, 1.2, -1.2, 1.6) * p + 5.3; a *= 0.5; }
    return v;
}

// One sinking drop: vortex-ring head + trailing stem, at age a (0..1).
float plume(vec2 p, float k, float a, float T, float aspect)
{
    float x0 = 0.5 + (hash11(k * 3.7) - 0.5) * aspect * 0.85;
    float headY = 1.12 - a * 1.35 + 0.05 * sin(k * 5.0);
    vec2 d = p - vec2(x0 + 0.05 * sin(a * 3.0 + k), headY);
    float R = 0.04 + 0.12 * a;                                  // ring radius grows
    // Curl the space around both lobes of the ring: filaments wind in.
    float tilt = 0.35 * (hash11(k * 9.1) - 0.5);
    d = mat2(cos(tilt), -sin(tilt), sin(tilt), cos(tilt)) * d;
    // The two lobes of the ring, each curling the other way; summed (not
    // mirrored with abs) so there is no seam down the middle.
    float lobe = 0.0;
    for (int sgn = 0; sgn < 2; ++sgn) {
        float sd = (sgn == 0) ? -1.0 : 1.0;
        float side = 1.0 + sd * 0.35 * (hash11(k * 4.3) - 0.5);
        vec2 lp = d - vec2(sd * R * side, 0.0);
        float lr = length(lp);
        float ang = sd * 2.2 / (lr * 18.0 + 0.6) * (0.6 + a);
        float cs = cos(ang), sn = sin(ang);
        vec2 sw = mat2(cs, -sn, sn, cs) * lp;
        float fib = fibres(sw * vec2(9.0, 22.0) + k * 7.0 + sd * 11.0 + T * 0.02);
        lobe += exp(-lr * lr / (0.0016 + 0.012 * a)) * (0.45 + 1.1 * fib);
    }
    // The cap over the ring (the mushroom top).
    float cap = exp(-pow(d.y - 0.015 - 0.4 * R, 2.0) / 0.0012) * exp(-d.x * d.x / (R * R * 1.8 + 0.001)) * 0.6;
    // Stem: from the ring up to the top, widening and thinning as it ages.
    float above = d.y;
    float w = 0.008 + 0.05 * clamp(above, 0.0, 1.0) * (0.4 + a);
    float stemFib = fibres(vec2(d.x * 30.0, d.y * 6.0) + k * 3.0);
    float stem = exp(-d.x * d.x / (w * w)) * smoothstep(0.0, 0.06, above) * (0.35 + 0.8 * stemFib) * (1.0 - 0.6 * a);
    float fade = smoothstep(0.0, 0.08, a) * (1.0 - smoothstep(0.7, 1.0, a));
    return (lobe + cap + stem) * fade;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = vec2((uv.x - 0.5) * aspect + 0.5, uv.y);
    float T = sceneTime + sceneAdvance * 0.6;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float ink = (inkP > 0.01) ? inkP : 0.65;
    float gl = (glowP > 0.01) ? glowP : 0.55;

    // Water moves the ink: a slow warp of the whole tank.
    vec2 wq = p * 3.0 + vec2(0.0, T * 0.02);
    vec2 warp = vec2(fbm(wq), fbm(wq + 7.3)) - 0.5;
    vec2 pw = p + warp * 0.08 + (vec2(fbm(wq * 3.0 + 1.3), fbm(wq * 3.0 + 4.1)) - 0.5) * 0.025;

    // Three inks, each with its own drops.
    vec3 inkC[3];
    inkC[0] = mix(vec3(0.05, 0.2, 0.75), imgPalette(0.6), 0.3);   // blue
    inkC[1] = mix(vec3(0.8, 0.08, 0.45), imgPalette(0.9), 0.3);   // magenta
    inkC[2] = mix(vec3(0.95, 0.55, 0.05), imgPalette(0.2), 0.3);  // amber
    vec3 absorb = vec3(0.0);
    float dens = 0.0;
    const float P = 30.0;                                           // life of a drop (s)
    for (int k = 0; k < 8; ++k) {
        float fk = float(k);
        float age = fract((T + fk * P / 8.0) / P);
        float cyc = floor((T + fk * P / 8.0) / P);
        float dn = plume(pw, fk * 13.0 + cyc * 3.1, age, T, aspect);
        vec3 c = inkC[k % 3];
        absorb += (vec3(1.0) - c) * dn;                             // what the ink takes out of white
        dens += dn;
    }

    // Back-light: a soft white panel, brighter at the top, with the faint
    // structure of the photo far behind the glass.
    vec3 back = mix(vec3(0.82, 0.86, 0.9), vec3(1.0, 0.99, 0.97), uv.y);
    back *= 0.85 + 0.25 * swell;
    back = mix(back, back * (0.75 + 0.5 * img(uv * 0.9 + 0.05)), 0.12);
    back *= 1.0 - 0.25 * length(uv - 0.5);                          // vignette of the tank

    vec3 col = back * exp(-absorb * 2.8 * (0.6 + 0.8 * ink));
    // Filament edges glint in the back-light.
    float edge = clamp(dens * (1.0 - dens * 0.8), 0.0, 1.0);
    col += vec3(1.0) * edge * 0.08 * gl * (0.6 + 1.2 * clamp(audioKick, 0.0, 1.0));

    col *= 0.92 + 0.16 * audioLevel;
    col = col / (1.0 + col * 0.2);
    col *= 1.15;
    fragColor = vec4(clamp(col, 0.0, 1.0), interpolation);
}
