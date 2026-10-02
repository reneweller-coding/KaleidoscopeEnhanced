#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file CaveDiversTorches.frag
 * @brief CAVE DIVERS TORCHES: inside a flooded limestone cave -- the tunnel
 * running away into blackness, its walls pale and scalloped by the water,
 * stalactites hanging from the roof, and two divers hovering in the
 * passage, their torches throwing long cones of light ahead that sweep
 * slowly over the rock, full of glittering suspended particles.  Where a
 * beam touches the wall the limestone lights up cream and gold; the rest
 * of the cave is darkness.  Silver bubbles rise from the divers in round
 * wobbling strings.  The camera hovers still.
 *
 * Audio Reactivity:
 *   audioBass   -> the brightness of the torches (light)
 *   audioHigh   -> the glitter of the particles in the beams (light)
 *   audioSwell  -> the haze of the water (slow)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the beams sweeping, bubbles rising
 *
 * Per-activation variety: sweepP (how widely the beams sweep), hueP.
 */

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float sweepP;
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

/// @brief Pseudo-random number 0..1 from a float.
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
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
    for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}
/// @brief Distance from a point to a line segment.
float sdSeg(vec2 p, vec2 a, vec2 b)
{
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}

/// A diver seen from behind and a little above: fins, legs, tank, head.
float diver(vec2 q, float s, float kick)
{
    q /= s;
    float d = sdSeg(q, vec2(-0.07, 0.06), vec2(0.07, 0.06)) - 0.045;              // shoulders
    d = min(d, sdSeg(q, vec2(0.0, 0.05), vec2(0.0, -0.07)) - 0.06);                 // back, tapering to the hips
    d = min(d, sdSeg(q, vec2(0.0, -0.06), vec2(0.0, 0.1)) - 0.045);                // the tank
    d = min(d, length(q - vec2(0.0, 0.15)) - 0.045);                                 // head and hood
    // Legs trailing toward us, long fins spread in a V and sculling.
    vec2 k1 = vec2(-0.07 + 0.015 * kick, -0.17), k2 = vec2(0.07 - 0.015 * kick, -0.17);
    d = min(d, sdSeg(q, vec2(-0.03, -0.06), k1) - 0.03);
    d = min(d, sdSeg(q, vec2(0.03, -0.06), k2) - 0.03);
    d = min(d, sdSeg(q, k1, k1 + vec2(-0.05, -0.12)) - 0.018 - 0.012 * smoothstep(k1.y, k1.y - 0.12, q.y));
    d = min(d, sdSeg(q, k2, k2 + vec2(0.05, -0.12)) - 0.018 - 0.012 * smoothstep(k2.y, k2.y - 0.12, q.y));
    d = min(d, sdSeg(q, vec2(-0.1, 0.06), vec2(-0.2, 0.18)) - 0.025);               // arm holding the torch
    return d * s;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    float px = 1.0 / resolution.y;
    float sw = 0.35 + 0.35 * clamp(sweepP, 0.0, 1.0);

    // The tunnel's opening: an irregular hole into blackness; outside it the walls.
    vec2 vc = vec2(0.08, 0.05);
    vec2 d = p - vc;
    float ang = atan(d.y, d.x);
    float rOpen = 0.28 + 0.08 * sin(ang * 2.0 + 1.0) + 0.06 * (fbm(vec2(cos(ang), sin(ang)) * 1.3 + 3.0) - 0.5);
    float r = length(d * vec2(0.8, 1.0));
    float wallMask = smoothstep(rOpen - 0.02, rOpen + 0.03, r);
    // Depth of the wall: near at the frame edges, receding toward the opening.
    float depthW = clamp((r - rOpen) / 0.6, 0.0, 1.0);

    // Limestone: scalloped, pale; stalactites hanging from the roof.
    vec2 wq = vec2(ang * 1.2, 1.0 / max(r, 0.05));
    float scallop = fbm(wq * vec2(3.0, 2.0)) + 0.4 * (1.0 - smoothstep(0.0, 0.4, abs(fract(fbm(wq * 4.0) * 4.0) - 0.5)));
    vec3 rock = mix(vec3(0.55, 0.5, 0.42), vec3(0.8, 0.74, 0.6), scallop * 0.6);
    rock = mix(rock, rock * imgPalette(0.1 + hueP * 0.159) * 1.3, 0.1);
    // Stalactites: tapering shapes pointing down from the upper wall into the opening.
    float stal = 0.0;
    {
        float sx = p.x * 24.0, si = floor(sx);
        for (int k = -1; k <= 1; ++k) {
            float id = si + float(k);
            if (hash11(id * 1.7) < 0.4) continue;
            float cx = (id + 0.5 + 0.3 * (hash11(id * 2.3) - 0.5)) / 24.0;
            // Root on the roof edge of the opening above this x.
            float rootY = vc.y + sqrt(max(rOpen * rOpen - pow((cx - vc.x) * 0.8, 2.0), 0.0)) - 0.01;
            float len = 0.04 + 0.1 * hash11(id * 3.1);
            float yy = (rootY - p.y) / len;
            float w = 0.012 * (1.0 - yy) * (0.7 + 0.5 * hash11(id * 4.3));
            stal = max(stal, smoothstep(px * 1.5, -px * 1.5, abs(p.x - cx) - w) * step(0.0, yy) * step(yy, 1.0) * step(cx > vc.x - 0.3 ? 0.0 : 1.0, 0.5) * step(p.y, rootY));
        }
    }
    float solid = max(wallMask, stal);

    // The divers and their beams.
    vec3 col = vec3(0.0);
    vec3 beamSum = vec3(0.0);
    float lightOnRock = 0.0;
    vec2 dpos[2];
    dpos[0] = vec2(-0.22, -0.12);
    dpos[1] = vec2(0.28, -0.02);
    float dsz[2];
    dsz[0] = 0.4; dsz[1] = 0.3;
    float figs = 1e9;
    for (int i = 0; i < 2; ++i) {
        float fi = float(i);
        vec2 dp = dpos[i] + vec2(0.01 * sin(T * 0.2 + fi * 2.0), 0.008 * sin(T * 0.27 + fi));
        vec2 torch = dp + vec2(-0.1, 0.09) * dsz[i];
        float aim = atan(vc.y - 0.06 - torch.y, vc.x - torch.x) + 0.7 * sw * sin(T * 0.07 + fi * 2.5) + 0.2 * sw * sin(T * 0.13 + fi);
        vec2 dir = vec2(cos(aim), sin(aim));
        vec2 rel = p - torch;
        float along = dot(rel, dir);
        float across = abs(dot(rel, vec2(-dir.y, dir.x)));
        // Where the beam's axis meets the tunnel wall (the opening's rim).
        float tHit = 0.05;
        for (int k = 0; k < 24; ++k) {
            vec2 h = torch + dir * tHit - vc;
            float ha = atan(h.y, h.x);
            float hr = 0.28 + 0.08 * sin(ha * 2.0 + 1.0) + 0.06 * (fbm(vec2(cos(ha), sin(ha)) * 1.3 + 3.0) - 0.5);
            if (length(h * vec2(0.8, 1.0)) > hr) break;
            tHit += 0.03;
        }
        vec2 H = torch + dir * tHit;
        float cone = smoothstep(0.1 * along + 0.01, 0.04 * along, across) * step(0.0, along) * smoothstep(tHit + 0.05, tHit - 0.02, along);
        float fall = exp(-along * 1.2);
        float I = (0.8 + 0.6 * bass);
        // The volume of the beam in the water, and the pool of light where it
        // lands on the rock (stretched along the beam, since it grazes the wall).
        beamSum += vec3(0.95, 0.9, 0.75) * cone * fall * I * (0.14 + 0.12 * swell);
        vec2 hq = p - H;
        float ha2 = dot(hq, dir), hc2 = dot(hq, vec2(-dir.y, dir.x));
        float spot = exp(-(ha2 * ha2) / (0.02 + 0.03 * tHit) - (hc2 * hc2) / (0.004 + 0.01 * tHit * tHit));
        float spill = exp(-length(hq) * 5.0) * 0.3;
        lightOnRock += (spot * 1.3 + spill) * I;
        figs = min(figs, diver(p - dp, dsz[i], sin(T * 1.1 + fi * 1.7)));
    }
    // Rock: dark, lit where the beams touch it.
    vec3 rockC = rock * (0.07 + 1.2 * lightOnRock) * (1.0 - 0.4 * depthW);
    // Inside the opening the tunnel goes on: its farther walls ring the
    // black core, faintly lit by the beams passing through.
    float farWall = smoothstep(rOpen * 0.42, rOpen * 0.6, r) * (1.0 - wallMask);
    vec3 farC = rock * (0.03 + 0.5 * clamp(dot(beamSum, vec3(0.33)) * 3.0, 0.0, 1.0)) * smoothstep(rOpen * 0.42, rOpen, r);
    col = mix(beamSum * 0.3 + farC * farWall, rockC, solid);
    col += beamSum * (1.0 - solid * 0.7);
    // Particles glittering inside the beams.
    {
        vec2 g = p * 70.0 + vec2(T * 0.05, T * 0.03), gi = floor(g), gf = fract(g);
        vec2 gc = 0.25 + 0.5 * hash22(gi);
        float tw = 0.5 + 0.5 * sin(T * 2.0 + hash21(gi + 7.0) * 40.0);
        float part = smoothstep(0.12, 0.0, length(gf - gc)) * step(0.75, hash21(gi + 5.0));
        col += vec3(1.0, 0.97, 0.9) * part * tw * clamp(dot(beamSum, vec3(0.33)) * 6.0, 0.0, 1.0) * (0.3 + 1.0 * hi) * (1.0 - solid);
    }
    // The divers: dark silhouettes rimmed by their own torch glow.
    col = mix(col, vec3(0.01, 0.015, 0.02), smoothstep(px * 1.5, -px * 1.5, figs));
    // Bubble strings rising from the divers: round, wobbling.
    for (int i = 0; i < 2; ++i) {
        vec2 dp = dpos[i] + vec2(0.0, 0.18 * dsz[i]);
        for (int k = 0; k < 7; ++k) {
            float fk = float(k);
            float ph = fract(T * 0.15 + fk / 7.0 + float(i) * 0.3);
            vec2 bc = dp + vec2(0.012 * sin(ph * 20.0 + fk), ph * 0.7);
            float br = 0.004 + 0.005 * hash11(fk + float(i) * 9.0);
            float bd = length(p - bc) - br;
            float ring = smoothstep(px * 1.5, 0.0, abs(bd)) + smoothstep(0.0, -br, bd) * 0.15;
            col += vec3(0.75, 0.85, 0.9) * ring * (0.3 + 0.7 * smoothstep(0.7, 0.0, ph)) * (0.3 + 0.7 * lightOnRock + 0.2);
        }
    }
    // Faint blue-green ambient water in the dark.
    col += vec3(0.0, 0.035, 0.045) * (0.6 + 0.6 * swell) * (1.0 - 0.6 * smoothstep(rOpen, 0.0, r));

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
