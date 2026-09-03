#version 330 core
out vec4 fragColor;
/**
 * @file HyperbolicEscherFish.frag
 * @brief HYPERBOLIC ESCHER FISH: Escher's Circle Limit with the fish
 * actually swimming.  The Poincare disc is tiled by a {p,q} polygon; in
 * every chamber a fish (body, tail, eye) is drawn from the same
 * fundamental-domain coordinates, alternating light and dark by chamber
 * parity.  The shoal swims toward the rim: a hyperbolic translation by one
 * polygon step is a symmetry of the tiling, so the swim is periodic and
 * its wrap invisible, and the fish shrink into the infinite edge as they
 * go.  Tails wag on the scene clock; the melody tints the shoal.
 *
 * Audio Reactivity:
 *   sceneAdvance     -> the swim (music-paced, periodic, seamless)
 *   sceneTime        -> tail wag (object motion, continuous)
 *   audioMelodyPitch -> shoal tint (light)
 *   audioKick        -> the eyes flash (light)
 *   audioSwell       -> disc breath (slow)
 *   audioLevel       -> brightness
 *
 * Per-activation variety: sidesP (p = 4, 6 or 8), qP, dirP (swim sense), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioMelodyPitch;
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float sidesP;
uniform float qP;
uniform float dirP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 cdiv(vec2 a, vec2 b) { return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / max(dot(b, b), 1e-9); }

// A fish in local coordinates: nose at +x, tail at -x, spanning ~[-0.5, 0.5].
float fishSdf(vec2 q, float wag)
{
    // Body: an ellipse.
    vec2 b = q / vec2(0.42, 0.2);
    float body = length(b) - 1.0;
    // Tail: a triangle behind the body, wagging.
    vec2 t = q - vec2(-0.42, 0.0);
    t.y -= wag * (t.x < 0.0 ? -t.x : 0.0) * 1.5;
    float tail = max(-t.x - 0.28, abs(t.y) - (-t.x) * 0.9);
    return min(body * 0.2, tail);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float pp = 4.0 + 2.0 * floor(clamp(sidesP, 0.0, 2.99));
    float qmin = (pp < 5.0) ? 5.0 : ((pp < 7.0) ? 4.0 : 3.0);
    float qq = qmin + floor(clamp(qP, 0.0, 0.99) * 2.0);
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float dir = (dirP > 0.5) ? 1.0 : -1.0;

    float re = acosh(cos(3.14159265 / qq) / sin(3.14159265 / pp));
    float u  = tanh(re * 0.5);
    float cx = (1.0 + u * u) / (2.0 * u);
    float R  = (1.0 - u * u) / (2.0 * u);

    float discR = 0.6 * (1.0 + 0.04 * clamp(audioSwell, 0.0, 1.0));
    vec2 z = p / discR;
    float rimD = abs(length(z) - 1.0);
    if (dot(z, z) > 1.0) z = z / dot(z, z);

    // The swim: translation along x by t, periodic in the polygon step.
    float L = 2.0 * re;
    float t = mod(dir * (sceneAdvance * 0.22 + sceneTime * 0.04), L);
    if (t < 0.0) t += L;
    float ch = cosh(t * 0.5), sh = sinh(t * 0.5);
    z = cdiv(z * ch + vec2(sh, 0.0), cmul(z, vec2(sh, 0.0)) + vec2(ch, 0.0));

    // Fold into the fundamental domain, counting inversions and remembering
    // the mirror parity of the sector fold too.
    float sector = 6.2831853 / pp;
    float inv = 0.0, flip = 0.0;
    for (int i = 0; i < 18; ++i)
    {
        float a = atan(z.y, z.x);
        float k = floor(a / sector);
        a = a - k * sector;
        flip += k;
        if (a > sector * 0.5) { a = sector - a; flip += 1.0; }
        z = length(z) * vec2(cos(a), sin(a));
        vec2 d = z - vec2(cx, 0.0);
        float dd = dot(d, d);
        if (dd < R * R) { z = vec2(cx, 0.0) + d * (R * R / max(dd, 1e-9)); inv += 1.0; }
        else break;
    }

    // Fish in the domain: local frame centred at the polygon's edge midpoint
    // side, nose pointing along the swim.
    vec2 local = (z - vec2(u * 0.55, u * 0.22)) / (u * 0.9);
    float wag = 0.25 * sin(sceneTime * 4.0 + inv * 1.3);
    float f = fishSdf(local, wag);
    float fish = 1.0 - smoothstep(-0.02, 0.02, f);
    float outline = exp(-abs(f) * 40.0);
    // Eye.
    float eye = exp(-dot(local - vec2(0.22, 0.05), local - vec2(0.22, 0.05)) * 900.0);

    float par = mod(inv + flip, 2.0);
    vec3 light = imgPalette(hue * 0.159 + 0.1 + 0.3 * audioMelodyPitch) * 1.4 + 0.2;
    vec3 dark  = imgPalette(hue * 0.159 + 0.6) * 0.35;
    vec3 fishCol = mix(light, dark, par);
    vec3 water   = mix(dark * 0.5, light * 0.35, par);
    vec3 col = mix(water, fishCol, fish);
    col += imgPalette(hue * 0.159 + 0.9) * outline * 0.35;
    col += vec3(1.0) * eye * (0.6 + 1.5 * audioKick);
    // Photo grain on the fish.
    col *= 0.8 + 0.4 * dot(img(fract(local * 0.5 + 0.5)), vec3(0.333));
    col *= 0.7 + 0.5 * audioLevel;
    col += imgPalette(hue * 0.159 + 0.5) * exp(-rimD * 30.0) * 0.5;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
