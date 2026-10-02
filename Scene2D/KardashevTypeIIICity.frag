#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file KardashevTypeIIICity.frag
 * @brief KARDASHEV TYPE III CITY: a whole spiral galaxy turned into one
 * machine.  The galaxy lies tilted in the frame -- golden bulge, blue arms
 * with pink star-forming knots and dark dust lanes -- and over its disc a
 * luminous network is woven from star to star, densest along the arms,
 * packets of light running along its links from node to node.  The galaxy
 * turns with slow, rigid majesty; the network hums with the music's light.
 *
 *   sceneTime/sceneAdvance -> the galaxy's turn, packets on the links
 *   audioSwell    -> brightness of the network (slow)
 *   audioKick     -> the nodes flare (light only)
 *   audioChromaHue-> photo tint of the network
 *
 * Per-activation variety:
 *   techP float density of the network (0.85..1.5)
 *   glowP float brightness of the packets (0.5..2.0)
 *   hueP float palette offset (0..6.28)
 */

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float techP;
uniform float glowP;   ///< Glow / afterglow knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief The house palette: a colour of the photo on an arc that turns with the music's hue.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

/// @brief Pseudo-random number 0..1 from a 2D point.
float hash21(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
/// @brief Pseudo-random 2D vector (each 0..1) from a 2D point.
vec2 hash22(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}
/// @brief Smooth 2D value noise, 0..1.
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
/// @brief Fractal noise: octaves of value noise.
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.1; a *= 0.5; }
    return v;
}

/// Arm density at disc point g (disc coordinates, already rotated).
float arms(vec2 g)
{
    float r = length(g);
    float a = atan(g.y, g.x);
    float s = cos(2.0 * (a - log(r + 0.02) * 2.6));
    return smoothstep(0.1, 1.0, s) * smoothstep(0.02, 0.15, r);
}

/// @brief Distance from a point to a line segment.
float sdSeg(vec2 p, vec2 a, vec2 b, out float h)
{
    vec2 pa = p - a, ba = b - a;
    h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float tp = (techP > 0.01) ? techP : 1.0;
    float gp = (glowP > 0.01) ? glowP : 1.0;
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float kick = clamp(audioKick, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.5;

    // Background: faint distant galaxies and stars.
    vec3 col = vec3(0.005, 0.006, 0.014);
    {
        vec2 g = p * 60.0;
        vec2 gi = floor(g), gf = fract(g);
        vec2 c = 0.2 + 0.6 * hash22(gi);
        col += vec3(0.8, 0.85, 1.0) * smoothstep(0.1, 0.0, length(gf - c)) * step(0.96, hash21(gi + 3.0)) * 0.6;
    }

    // Into the disc plane: tilt (the disc is seen at ~60 degrees) and a
    // slow rigid turn.
    vec2 q = p - vec2(0.02, 0.0);
    float tiltRot = 0.35;
    q = mat2(cos(tiltRot), -sin(tiltRot), sin(tiltRot), cos(tiltRot)) * q;
    vec2 g = vec2(q.x, q.y / 0.5) / 0.95;
    float spin = -T * 0.008;
    g = mat2(cos(spin), -sin(spin), sin(spin), cos(spin)) * g;
    float r = length(g);

    // The galaxy itself.
    float armD = arms(g + 0.06 * (vec2(fbm(g * 4.0), fbm(g * 4.0 + 5.0)) - 0.5));
    float disc = exp(-r * 1.7);
    float bulge = exp(-r * r * 40.0);
    float dust = smoothstep(0.35, 0.75, arms(g * 1.0 + vec2(0.03, -0.02))) * smoothstep(0.08, 0.3, r) * (0.5 + 0.5 * fbm(g * 9.0));
    float clumps = pow(fbm(g * 14.0), 3.0) * 3.0;
    vec3 gal = vec3(1.0, 0.85, 0.6) * bulge * 2.2
             + vec3(0.55, 0.7, 1.0) * disc * (0.2 + 1.8 * armD * (0.6 + clumps))
             + vec3(1.0, 0.45, 0.65) * disc * armD * smoothstep(0.55, 0.9, fbm(g * 20.0)) * 1.5;
    gal *= 1.0 - 0.75 * dust;
    col += gal * (r < 1.6 ? 1.0 : 0.0);

    // The network: a node per cell in the disc plane (star systems), linked
    // to its right and upper neighbours; links bright where the arms are.
    float cellS = 13.0 * tp;
    vec2 gc = g * cellS;
    vec2 gi = floor(gc);
    vec3 netC = mix(vec3(0.35, 0.95, 1.0), imgPalette(0.55 + hue * 0.159), 0.3);
    vec3 nodeC = mix(vec3(1.0, 0.8, 0.45), imgPalette(0.1 + hue * 0.159), 0.25);
    float net = 0.0, pk = 0.0, node = 0.0;
    for (int j = -1; j <= 1; ++j)
    for (int i = -1; i <= 1; ++i) {
        vec2 c = gi + vec2(i, j);
        vec2 a = c + 0.2 + 0.6 * hash22(c);
        float ha = hash21(c + 7.7);
        // Node.
        float dn = length(gc - a);
        node += exp(-dn * dn * 60.0) * step(0.3, ha);
        // Links to the right and up neighbours (present or not by hash).
        for (int k = 0; k < 2; ++k) {
            vec2 cb = c + ((k == 0) ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
            if (hash21(c * 3.1 + float(k) * 5.0) < 0.35) continue;
            vec2 b = cb + 0.2 + 0.6 * hash22(cb);
            float h;
            float ds = sdSeg(gc, a, b, h);
            net += exp(-ds * 30.0);
            float pos = fract(T * 0.25 * (0.5 + hash21(c + float(k))) + hash21(c * 1.7 + float(k)));
            pk += exp(-ds * 30.0) * exp(-pow((h - pos) * 12.0, 2.0));
        }
    }
    // The network lives on the disc: dense along the arms, thin in between.
    float onDisc = smoothstep(1.2, 0.7, r) * (0.15 + 1.4 * armD + 0.6 * bulge);
    col += netC * net * 0.22 * onDisc * (0.7 + 0.5 * swell);
    col += netC * pk * 0.9 * gp * onDisc;
    col += nodeC * node * 0.7 * onDisc * (0.8 + 1.2 * kick);

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
