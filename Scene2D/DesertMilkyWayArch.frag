#version 330 core
out vec4 fragColor;
/**
 * @file DesertMilkyWayArch.frag
 * @brief DESERT MILKY WAY ARCH: a sandstone arch in the desert at night,
 * the Milky Way rising through it -- a band of countless round stars with
 * dark dust lanes and the warm glow of the galactic core, turning slowly
 * across the sky as the night goes on.  A small campfire at the foot of the
 * arch lights its inner curve orange; beyond, the desert floor and distant
 * buttes lie in starlight.  The sky's turn is steady; the music is the
 * light: the fire's flicker and the core's glow.
 *
 * Audio Reactivity:
 *   audioSwell  -> the core's glow (slow)
 *   audioKick   -> the fire flares (light only)
 *   audioBass   -> the fire's warmth on the rock (light)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the sky's turn, the flicker (continuous)
 *
 * Per-activation variety: starsP (star density), fireP, hueP.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneTime;
uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioKick;
uniform float audioBass;
uniform float audioLevel;
uniform float audioValence;
uniform float audioChromaHue;

uniform float starsP;
uniform float fireP;
uniform float hueP;

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
    for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.2; a *= 0.5; }
    return v;
}

// Stars in one layer: round points with a little colour.
vec3 starLayer(vec2 q, float scale, float dens, float seed)
{
    vec2 g = q * scale;
    vec2 gi = floor(g), gf = fract(g);
    float h = hash21(gi + seed);
    vec2 c = 0.25 + 0.5 * vec2(hash21(gi + seed + 1.3), hash21(gi + seed + 4.1));
    float on = step(1.0 - dens, h);
    float b = (h - (1.0 - dens)) / max(dens, 1e-3);
    vec3 sc = mix(vec3(1.0, 0.8, 0.65), vec3(0.75, 0.85, 1.0), hash21(gi + seed + 7.0));
    return sc * on * smoothstep(0.12, 0.0, length(gf - c)) * (0.3 + 1.2 * b * b);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float kick = clamp(audioKick, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.5;
    float sd = 0.25 + 0.5 * clamp(starsP, 0.0, 1.0);
    float fireAmt = 0.7 + 0.6 * clamp(fireP, 0.0, 1.0);

    // The sky turns slowly about a pole off the top of the frame.
    vec2 pole = vec2(-0.2, 1.4);
    float ang = T * 0.004;
    vec2 q = pole + mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * (p - pole);

    // Night sky gradient with airglow near the horizon.
    vec3 col = mix(vec3(0.06, 0.07, 0.12), vec3(0.01, 0.015, 0.04), smoothstep(-0.2, 0.5, p.y));
    col += vec3(0.08, 0.1, 0.05) * exp(-(p.y + 0.15) * 6.0) * 0.5;

    // The Milky Way: a band tilted across the sky.
    vec2 bdir = normalize(vec2(0.55, 1.0));
    float across = dot(q - vec2(0.1, -0.1), vec2(-bdir.y, bdir.x));
    float along = dot(q, bdir);
    float band = exp(-across * across / 0.045);
    float cloud = fbm(vec2(along * 2.0, across * 4.0)) * 0.6 + fbm(q * 9.0) * 0.4;
    float lanes = smoothstep(0.5, 0.7, fbm(vec2(along * 3.0 + 3.0, across * 10.0))) * exp(-across * across / 0.01);    // dark rifts along the middle
    vec3 mw = mix(vec3(0.55, 0.55, 0.7), vec3(1.0, 0.8, 0.6), smoothstep(0.1, -0.5, along));
    mw = mix(mw, imgPalette(0.1 + hue * 0.159), 0.1);
    float core = exp(-dot(q - vec2(-0.05, -0.28), q - vec2(-0.05, -0.28)) * 5.0) * (0.8 + 0.5 * swell);
    col += mw * band * (0.5 * cloud + core * 1.1) * (1.0 - 0.7 * lanes);
    // Stars, denser in the band.
    col += starLayer(q, 140.0, 0.08 * sd * (1.0 + 3.0 * band), 0.0) * 0.6;
    col += starLayer(q, 60.0, 0.05 * sd * (1.0 + 2.0 * band), 11.0);
    col += starLayer(q, 25.0, 0.03 * sd, 23.0) * 1.2;

    // Distant buttes on the horizon.
    float hor = -0.22;
    float buttes = hor + 0.05 * smoothstep(0.45, 0.55, noise2(vec2(p.x * 3.0, 1.0))) + 0.01 * noise2(vec2(p.x * 20.0, 2.0));
    if (p.y < buttes) col = vec3(0.02, 0.025, 0.04) + vec3(0.02, 0.02, 0.03) * noise2(p * 40.0);
    // Desert floor: faint starlit sand, the fire's warm pool.
    vec2 fireP2 = vec2(0.05, -0.36);
    float flick = 0.8 + 0.2 * sin(T * 11.0) * sin(T * 7.3 + 1.0) + 0.5 * kick;
    vec3 fireC = vec3(1.0, 0.55, 0.2) * fireAmt * flick;
    if (p.y < hor - 0.01) {
        vec3 sand = vec3(0.06, 0.05, 0.05) * (0.8 + 0.4 * noise2(p * 60.0));
        sand += fireC * exp(-length((p - fireP2) * vec2(1.0, 3.0)) * 5.0) * 0.5;
        col = sand;
    }

    // The arch: a stout sandstone span on two legs, thinner at the crown.
    vec2 ac = vec2(0.02, -0.3);
    float outer = length((p - ac) / vec2(0.62, 0.62)) - 1.0;
    float inner = length((p - ac - vec2(0.02, -0.06)) / vec2(0.4, 0.5)) - 1.0;
    float rough = 0.14 * (fbm(p * 3.5) - 0.5) + 0.03 * (fbm(p * 25.0) - 0.5);
    outer -= 0.25 * smoothstep(-0.1, -0.45, p.y);                 // the legs widen into their footings
    outer -= 0.12 * smoothstep(0.0, 0.3, p.y - ac.y - 0.3);       // a heavier cap of rock on the crown
    float archMask = step(outer + rough, 0.0) * step(0.0, inner - rough) * step(-0.46, p.y);
    if (archMask > 0.0) {
        float strata = 0.7 + 0.3 * fbm(vec2(p.x * 5.0, p.y * 30.0));
        float crack = smoothstep(0.015, 0.0, abs(fbm(p * 7.0) - 0.5)) * 0.3;
        vec3 rock = vec3(0.13, 0.075, 0.06) * strata * (1.0 - crack);
        // The fire lights the inner curve and the legs from below.
        float toFire = length(p - fireP2);
        float innerLit = exp(-max(inner, 0.0) * 12.0);
        rock += vec3(0.9, 0.4, 0.15) * fireAmt * flick * exp(-toFire * 3.0) * (0.5 + 1.2 * innerLit) * (0.9 + 0.6 * clamp(audioBass, 0.0, 1.0));
        // Starlight rim on top.
        rock += vec3(0.1, 0.12, 0.2) * exp(-max(-outer, 0.0) * 30.0) * 0.5;
        col = rock;
    }
    // The fire itself and its glow.
    vec2 fq = p - fireP2;
    float flame = exp(-(fq.x * fq.x * 4000.0 + max(fq.y, 0.0) * max(fq.y, 0.0) * 1200.0 + min(fq.y, 0.0) * min(fq.y, 0.0) * 20000.0));
    col += fireC * (flame * 2.5 + exp(-length(fq) * 18.0) * 0.4);
    // Sparks rising: round, drifting up.
    for (int k = 0; k < 8; ++k) {
        float fk = float(k);
        float ph = fract(T * 0.25 + fk * 0.137);
        vec2 sp = fireP2 + vec2(0.03 * sin(fk * 3.7 + T * 1.3) * ph, ph * 0.22);
        col += vec3(1.0, 0.6, 0.25) * exp(-dot(p - sp, p - sp) * 60000.0) * (1.0 - ph) * 1.5;
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
