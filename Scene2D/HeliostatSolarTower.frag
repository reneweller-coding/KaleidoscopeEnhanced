#version 330 core
out vec4 fragColor;
/**
 * @file HeliostatSolarTower.frag
 * @brief HELIOSTAT SOLAR TOWER: a field of mirrors around a central
 * receiver tower.  Every heliostat holds the sun on the receiver, so the
 * field is a ring pattern of tilted panels, each reflecting a piece of
 * the sky (the photo).  The panels track slowly on the scene clock, the
 * receiver glows with the bass, and the treble is the glint that runs
 * across the field as a panel edge catches the light.  Camera fixed on
 * the field, the tower at the centre.
 *
 * Audio Reactivity:
 *   sceneAdvance -> the panels track, the field turns (continuous)
 *   audioBass    -> receiver glow (slow)
 *   audioHigh    -> panel glints (light)
 *   audioSwell   -> daylight and the beam haze (slow)
 *   audioKick    -> a flock of birds crossing (light, local)
 *
 * Per-activation variety: ringsP, tiltP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioBass;
uniform float audioHigh;
uniform float audioSwell;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float ringsP;
uniform float tiltP;
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

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float rings = 5.0 + floor(clamp(ringsP, 0.0, 1.0) * 4.0);           // once per activation
    float tiltAmt = 0.5 + 0.6 * clamp(tiltP, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float day = 0.6 + 0.55 * clamp(audioSwell, 0.0, 1.0);
    float clock = sceneAdvance * 0.3 + sceneTime * 0.06;

    float horizon = 0.16;
    vec2 towerBase = vec2(0.0, horizon);
    float receiverY = horizon + 0.3;
    vec3 sunCol = mix(vec3(1.0, 0.93, 0.72), imgPalette(hue * 0.159 + 0.1), 0.25);

    // The sky: the photo, bleached near the horizon as a desert sky is.
    vec3 sky = img(vec2(uv.x, 0.55 + uv.y * 0.45)) * mix(vec3(0.75, 0.85, 1.0), imgPalette(hue * 0.159 + 0.6), 0.3);
    sky = mix(sky * 1.2, vec3(0.9, 0.88, 0.82) * day, smoothstep(0.5, horizon, p.y) * 0.7);
    vec3 col = sky * day;
    // The ground: pale desert, receding.
    float onGround = step(p.y, horizon);
    float depth = (horizon - p.y);
    vec3 ground = mix(vec3(0.55, 0.48, 0.38), imgPalette(hue * 0.159 + 0.15), 0.25) * day;
    ground *= 0.75 + 0.35 * noise2(vec2(p.x * 30.0 / max(depth, 0.02), 1.0 / max(depth, 0.02)));
    col = mix(col, ground, onGround);

    // The heliostat field: concentric rings of panels around the tower,
    // drawn in ground perspective (a row's screen height falls with depth).
    if (onGround > 0.5)
    {
        // Ground-plane coordinates: distance from the tower and angle.
        float zz = 0.09 / max(depth, 1e-3);                              // depth into the field
        float xx = p.x * (1.0 + zz * 1.6);
        float r = length(vec2(xx, zz * 0.5));
        float a = atan(zz * 0.5, xx);
        // Ring and slot indices: panels stand on rings around the tower.
        float ringF = r * rings * 1.4;
        float ri = floor(ringF);
        float rf = fract(ringF);
        float slots = 8.0 + ri * 5.0;
        float slotF = (a / 3.14159 + 1.0) * 0.5 * slots;
        float si = floor(slotF);
        float sf = fract(slotF);
        // Each panel: a rectangle standing on a post, tilted to hold the
        // sun on the receiver -- so the tilt varies smoothly with position.
        float toTower = atan(zz * 0.5, xx);
        float tilt = tiltAmt * (0.35 + 0.4 * sin(clock * 0.12 + r * 1.5));
        float panelW = 0.34, panelH = 0.28;
        vec2 q = vec2(sf - 0.5, rf - 0.5);
        float inPanel = step(abs(q.x), panelW) * step(abs(q.y), panelH);
        if (inPanel > 0.5 && zz > 0.05)
        {
            // The mirror shows the sky, shifted by its tilt.
            vec2 mirUV = clamp(vec2(0.5 + q.x * 0.8 + sin(a) * 0.2, 0.72 + tilt * 0.2 + q.y * 0.4), 0.0, 1.0);
            vec3 mir = img(mirUV) * mix(vec3(0.8, 0.88, 1.0), imgPalette(hue * 0.159 + 0.5), 0.3) * (0.7 + 0.6 * day);
            // The panel's own shading: darker at grazing tilt.
            mir *= 0.55 + 0.6 * (0.5 + 0.5 * cos(a * 2.0 + clock * 0.12));
            // The glint: a narrow bright band running across the field as
            // the tracking angle passes the specular direction.
            float glintPhase = cos(a - clock * 0.25) * 0.5 + 0.5;
            float glint = pow(glintPhase, 26.0);
            mir += sunCol * glint * (0.5 + 1.6 * hi) * 1.2;
            // Frame and mullions.
            float frame = smoothstep(0.03, 0.0, min(panelW - abs(q.x), panelH - abs(q.y)));
            float mull = smoothstep(0.012, 0.0, abs(q.x)) + smoothstep(0.012, 0.0, abs(q.y));
            mir = mix(mir, vec3(0.2, 0.2, 0.22) * day, clamp(frame + mull * 0.6, 0.0, 1.0) * 0.8);
            // Distance haze.
            float fade = exp(-zz * 0.16);
            col = mix(col, mix(sky * day, mir, fade), inPanel * smoothstep(0.05, 0.12, zz));
            // The post's shadow on the ground below it.
            col *= 1.0 - 0.25 * smoothstep(panelH * 0.9, panelH, abs(q.y + 0.4));
        }
    }
    // The tower: a slender shaft with the receiver at the top.
    float shaft = smoothstep(0.042, 0.03, abs(p.x)) * step(horizon - 0.02, p.y) * step(p.y, receiverY);
    vec3 towerCol = mix(vec3(0.7, 0.68, 0.62), imgPalette(hue * 0.159 + 0.05), 0.25) * day;
    towerCol *= 0.7 + 0.4 * smoothstep(-0.02, 0.02, p.x);                // a lit side
    col = mix(col, towerCol, shaft);
    // The receiver: a glowing block, its brightness on the bass.
    vec2 rq = p - vec2(0.0, receiverY);
    float rec = smoothstep(0.07, 0.05, max(abs(rq.x) * 1.2, abs(rq.y)));
    vec3 recCol = mix(vec3(1.0, 0.95, 0.8), sunCol, 0.5);
    col = mix(col, recCol * (1.2 + 1.6 * bass), rec);
    col += recCol * exp(-length(rq) * 9.0) * (0.35 + 1.1 * bass);
    col += recCol * exp(-length(rq) * 2.2) * (0.06 + 0.3 * bass) * day;
    // Converging beams: faint lines of lit haze from the field to the receiver.
    for (int i = 0; i < 9; ++i)
    {
        float fi = float(i);
        float a = 3.14159 * (0.12 + 0.76 * fi / 8.0);
        vec2 from = vec2(cos(a) * (0.35 + 0.4 * hash11(fi)), horizon - 0.06 - 0.05 * hash11(fi * 3.3));
        vec2 d = vec2(0.0, receiverY) - from;
        float t = clamp(dot(p - from, d) / dot(d, d), 0.0, 1.0);
        float dist = length(p - (from + d * t));
        col += sunCol * smoothstep(0.012, 0.0, dist) * (0.05 + 0.12 * clamp(audioSwell, 0.0, 1.0)) * t;
    }
    // Birds: a small flock crossing high, lifted by the kick.
    for (int i = 0; i < 6; ++i)
    {
        float fi = float(i);
        vec2 b = vec2(fract(clock * 0.06 + fi * 0.11) * aspect * 1.6 - aspect * 0.8,
                      0.36 + 0.05 * sin(clock * 1.5 + fi));
        vec2 d = p - b;
        float wing = smoothstep(0.012, 0.0, abs(abs(d.x) * 0.6 - d.y) - 0.002) * smoothstep(0.02, 0.0, abs(d.x) - 0.012);
        col = mix(col, vec3(0.1), wing * (0.4 + 0.6 * audioKick));
    }
    col *= 0.9 + 0.2 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
