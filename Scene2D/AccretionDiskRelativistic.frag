#version 330 core
out vec4 fragColor;
/**
 * @file AccretionDiskRelativistic.frag
 * @brief RELATIVISTIC ACCRETION DISK: a black hole seen almost edge-on, its
 * disc bent over the top and under the bottom by the hole's gravity (rays
 * are marched with a 1/r^2 pull toward the centre, so the far side of the
 * disc appears above and below the shadow), and Doppler-beamed: the side
 * of the disc coming toward us burns brighter and bluer, the receding side
 * dims and reddens.  The disc turns on the music's pace, inner rings faster
 * than outer (Kepler); the turbulence in the gas follows the roughness of
 * the sound.  The camera never moves.
 *
 * Audio Reactivity:
 *   sceneAdvance     -> disc rotation (Keplerian, continuous)
 *   audioRoughness   -> turbulence contrast in the gas (light)
 *   audioMelodyPitch -> colour temperature of the disc (light)
 *   audioSwell       -> radius of the brightest ring (slow)
 *   audioBass        -> glow of the photon ring
 *   audioKick        -> the photon ring flashes
 *
 * Per-activation variety: tiltP (viewing angle), spinP (rotation sense), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioRoughness;
uniform float audioMelodyPitch;
uniform float audioSwell;
uniform float audioBass;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float tiltP;
uniform float spinP;
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

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

// Disc emission at a point in the disc plane (x, z); returns rgb.
vec3 discAt(vec2 q, float spin, float hue, float turb, float ringR, vec3 toCam)
{
    float r = length(q);
    const float rIn = 0.42, rOut = 2.6;
    if (r < rIn || r > rOut) return vec3(0.0);
    float a = atan(q.y, q.x);
    // Keplerian rotation: angle advances faster inside.
    float omega = 1.4 / pow(r, 1.5);
    float phi = a - spin * sceneAdvance * omega - sceneTime * 0.05 * omega;
    // Gas: spiral bands and turbulence.
    float bands = 0.5 + 0.5 * sin(phi * 3.0 + r * 4.0);
    float gas = noise2(vec2(phi * 2.0, r * 6.0)) * 0.6 + noise2(vec2(phi * 5.0 + 3.0, r * 14.0)) * 0.4;
    gas = mix(0.6, gas, turb);
    // Radial profile: bright inside, a highlighted ring, fading out.
    float prof = pow(rIn / r, 1.6) + 0.8 * exp(-pow((r - ringR) * 4.0, 2.0));
    float edge = smoothstep(rIn, rIn + 0.06, r) * (1.0 - smoothstep(rOut - 0.5, rOut, r));
    // Doppler beaming: velocity is tangential; the part moving toward the
    // camera brightens and blues.
    vec2 vel = spin * vec2(-sin(a), cos(a));
    float beta = 0.55 * sqrt(rIn / r);
    float towards = dot(vel, toCam.xz);
    float beam = pow(clamp(1.0 + beta * towards, 0.2, 2.0), 3.0);
    vec3 warm = imgPalette(hue * 0.159 + 0.05 + 0.25 * audioMelodyPitch);
    vec3 cool = imgPalette(hue * 0.159 + 0.55);
    vec3 col = mix(warm, cool, clamp(0.5 + 0.8 * beta * towards, 0.0, 1.0));
    return col * prof * (0.35 + 0.65 * gas) * (0.5 + 0.5 * bands) * beam * edge * 3.5;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float tilt = 0.12 + 0.25 * clamp(tiltP, 0.0, 1.0);         // nearly edge-on
    float spin = (spinP > 0.5) ? 1.0 : -1.0;
    float hue  = (hueP > 0.001) ? hueP : 0.0;
    float turb = 0.3 + 0.7 * clamp(audioRoughness * 2.0, 0.0, 1.0);
    float ringR = 0.7 + 0.9 * clamp(audioSwell, 0.0, 1.0);

    // Camera at distance, looking at the hole; the disc plane is tilted.
    vec3 ro = vec3(0.0, 0.0, -5.0);
    vec3 rd = normalize(vec3(p.x, p.y, 1.6));
    float ct = cos(tilt), st = sin(tilt);
    // Rotate the world so the disc plane is y = 0 in march space.
    mat3 toDisc = mat3(1.0, 0.0, 0.0, 0.0, ct, -st, 0.0, st, ct);
    vec3 pos = toDisc * ro;
    vec3 dir = toDisc * rd;

    // March with gravitational bending: each step pulls the direction toward
    // the hole by ~1/r^2.  Crossings of the disc plane collect emission; the
    // event horizon swallows the ray.
    vec3 col = vec3(0.0);
    float shadow = 0.0;
    const float M = 0.42;
    const int STEPS = 96;
    float h = 0.16;
    for (int i = 0; i < STEPS; ++i)
    {
        vec3 nxt = pos + dir * h;
        float r = length(nxt);
        if (r < 0.32) { shadow = 1.0; break; }
        // Disc plane crossing between pos and nxt.
        if (pos.y * nxt.y < 0.0)
        {
            float t = pos.y / (pos.y - nxt.y);
            vec3 hit = mix(pos, nxt, t);
            vec3 toCam = normalize(toDisc * (ro) - hit);
            col += discAt(hit.xz, spin, hue, turb, ringR, toCam);
        }
        // Bend: acceleration toward the origin, scaled to give a photon ring.
        vec3 acc = -nxt * M / (r * r * r + 0.02);
        dir = normalize(dir + acc * h);
        pos = nxt;
        if (r > 12.0) break;
    }

    // Background: deep space with the photo's grain as stars, lensed a bit
    // by the final direction.
    if (shadow < 0.5)
    {
        vec2 su = dir.xy * 3.0 + vec2(0.5);
        vec2 cell = floor(su * 90.0); vec2 f = fract(su * 90.0) - 0.5;
        float hs = hash21(cell);
        float star = step(0.985, hs) * exp(-dot(f, f) * 10.0);
        col += vec3(star) * 0.5 + imgPalette(hue * 0.159 + 0.6) * 0.03;
    }

    // Photon ring: a thin bright ring at the shadow's edge, glowing with the
    // bass and flashing on the kick.
    float rr = length(p);
    float ring = exp(-abs(rr - 0.19) * 140.0);
    col += imgPalette(hue * 0.159 + 0.9) * ring * (0.25 + 0.6 * audioBass + 0.8 * audioKick);
    col *= 0.85 + 0.35 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
