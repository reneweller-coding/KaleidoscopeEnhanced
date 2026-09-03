#version 330 core
out vec4 fragColor;
/**
 * @file BuildUpRocketLaunch.frag
 * @brief BUILD-UP ROCKET LAUNCH: a rocket on the pad at night.  As the
 * music builds, the pad comes alive -- venting vapour thickens, the
 * floodlights come up, the countdown lamps light one by one (all smooth
 * functions of the build-up envelope) -- and the drop is liftoff: the
 * engines light, the rocket climbs on the scene clock from the drop
 * instant, the exhaust cloud rolls out.  Objects move; the camera on the
 * causeway does not.  The photo is the night landscape and the rocket's
 * livery.
 *
 * Audio Reactivity:
 *   audioBuildUp -> vapour, floodlights, countdown lamps (slow)
 *   audioDrop    -> liftoff (the drop; then the climb on the clock)
 *   sceneAdvance -> vapour drift, the climb (continuous)
 *   audioBass    -> engine rumble as light (light)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: sizeP, padP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioBuildUp;
uniform float audioDrop;
uniform float audioBass;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float sizeP;
uniform float padP;
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
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = p * 2.03 + 5.0; a *= 0.5; }
    return v;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float size = 0.9 + 0.3 * clamp(sizeP, 0.0, 1.0);
    float build = clamp(audioBuildUp, 0.0, 1.0);
    float drop = clamp(audioDrop, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    // Liftoff: the drop envelope decays from 1; the climb height grows as
    // (1 - drop) while the drop is alive, so the rocket rises smoothly and
    // is back on the pad (reset by the next scene) once the envelope ends.
    // A soft gate on the drop envelope: a hard step here toggled the
    // engines frame by frame on envelope noise (strobe 40).
    float lit = smoothstep(0.03, 0.14, drop);
    float climb = (1.0 - drop) * lit;
    float rocketY = -0.3 + climb * 1.6;
    float ground = -0.38;

    // Night: sky, stars, the photo as the distant landscape and water.
    vec3 col = mix(vec3(0.02, 0.02, 0.05), vec3(0.05, 0.05, 0.1), p.y + 0.5);
    vec2 su = p * 90.0; vec2 sc = floor(su); vec2 sf = fract(su) - 0.5;
    vec2 so = vec2(hash21(sc + 1.3), hash21(sc + 5.9)) - 0.5;
    col += vec3(0.7) * smoothstep(0.14, 0.03, length(sf - so * 0.6)) * step(0.985, hash21(sc)) * step(ground, p.y);
    vec3 land = img(vec2(p.x / aspect + 0.5, (p.y + 0.5) * 0.5)) * imgPalette(hue * 0.159 + 0.55) * 0.25;
    col = mix(col, land, step(p.y, ground));
    // Floodlights on the pad: cones brightening with the build-up.
    float flood = (0.15 + 0.85 * build);
    for (int i = -1; i <= 1; i += 2)
    {
        vec2 fp = vec2(float(i) * 0.45, ground + 0.02);
        vec2 d = p - fp;
        float cone = smoothstep(0.35, 0.0, abs(atan(d.x, d.y) + float(i) * 0.5)) * step(0.0, d.y) * exp(-d.y * 2.0);
        col += vec3(1.0, 0.95, 0.85) * cone * 0.25 * flood;
    }
    // The tower and the pad.
    float tower = step(abs(p.x - 0.16), 0.02) * step(ground, p.y) * step(p.y, 0.32);
    col = mix(col, vec3(0.15, 0.13, 0.12) * (0.5 + 0.5 * flood), tower);
    col = mix(col, vec3(0.1), step(abs(p.x), 0.3) * step(ground - 0.04, p.y) * step(p.y, ground + 0.02));
    // Countdown lamps on the tower: light one by one with the build-up.
    for (int k = 0; k < 8; ++k)
    {
        float fk = float(k);
        float ly = ground + 0.06 + fk * 0.035;
        float on = smoothstep(fk / 8.0, (fk + 1.0) / 8.0, build);
        col += mix(vec3(1.0, 0.2, 0.1), vec3(0.2, 1.0, 0.3), on) * smoothstep(0.008, 0.004, length(p - vec2(0.2, ly))) * (0.3 + 0.9 * on);
    }
    // Vapour venting: fbm cloud around the rocket base, thickening with the build.
    vec2 vp = vec2(p.x + sceneAdvance * 0.05, p.y - sceneAdvance * 0.08);
    float vap = fbm(vp * 4.0) * smoothstep(0.35, 0.0, length((p - vec2(0.02, ground + 0.1)) * vec2(1.0, 1.6))) * build;
    col = mix(col, vec3(0.8, 0.82, 0.85) * (0.3 + 0.7 * flood), clamp(vap * 1.5, 0.0, 0.8));
    // The rocket: a cylinder with a nose, livery from the photo; climbs on liftoff.
    float rx = 0.0, rw = 0.045 * size, rh = 0.55 * size;
    vec2 rp = p - vec2(rx, rocketY);
    float body = step(abs(rp.x), rw) * step(0.0, rp.y) * step(rp.y, rh);
    float nose = step(abs(rp.x), rw * (1.0 - (rp.y - rh) / (0.12 * size))) * step(rh, rp.y) * step(rp.y, rh + 0.12 * size);
    float fin = step(abs(rp.x), rw + 0.03 * (1.0 - rp.y / (0.1 * size))) * step(0.0, rp.y) * step(rp.y, 0.1 * size);
    float rocket = max(max(body, nose), fin);
    float nx = rp.x / rw;
    vec3 livery = img(vec2(fract(rp.y * 2.0), 0.5 + nx * 0.4)) * 0.5 + 0.45;
    livery = mix(livery, imgPalette(hue * 0.159 + 0.1), step(0.25, fract(rp.y / (0.14 * size))) * 0.0);
    float shade = 0.5 + 0.5 * sqrt(max(1.0 - nx * nx, 0.0));
    vec3 rocketCol = livery * shade * (0.35 + 0.65 * flood);
    rocketCol += vec3(0.9, 0.3, 0.2) * step(abs(fract(rp.y / (0.14 * size)) - 0.5), 0.05) * 0.4;   // bands
    col = mix(col, rocketCol, rocket);
    // Engines: at liftoff the flame and the exhaust cloud.
    if (lit > 0.001)
    {
        vec2 ep = p - vec2(rx, rocketY);
        float flame = smoothstep(0.0, -0.35 * size, ep.y) * smoothstep(rw * 1.6, 0.0, abs(ep.x) - 0.02 * fbm(ep * 20.0 + sceneAdvance * 3.0)) * step(ep.y, 0.0);
        vec3 flameCol = mix(vec3(1.0, 0.9, 0.6), vec3(1.0, 0.4, 0.1), clamp(-ep.y / (0.3 * size), 0.0, 1.0));
        col += flameCol * flame * (1.5 + 1.5 * bass) * lit;
        // The exhaust cloud rolling out along the ground from the drop instant.
        float spread = 0.1 + climb * 1.0;
        float cloud = fbm(vec2(p.x * 3.0 - sceneAdvance * 0.2, p.y * 5.0)) * smoothstep(spread, 0.0, abs(p.x)) * smoothstep(0.3 + climb * 0.3, 0.0, p.y - ground) * step(ground - 0.05, p.y);
        col = mix(col, vec3(0.9, 0.85, 0.8) * (0.4 + 0.6 * flood) + flameCol * 0.3 * (1.0 - climb), clamp(cloud * 2.0, 0.0, 0.9) * lit);
        // The whole pad glows orange with the engines.
        col += flameCol * exp(-length(p - vec2(rx, rocketY)) * 2.5) * 0.4 * (1.0 - climb * 0.5) * lit;
    }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
