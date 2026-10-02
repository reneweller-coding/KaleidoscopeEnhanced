#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file SupercellMesocyclone.frag
 * @brief SUPERCELL MESOCYCLONE: the storm chasers' "mothership" over the
 * plains at dusk.  A colossal rotating updraft stacked in striated tiers
 * like a layer cake, lit gold on its sunset side and steel-blue in shade,
 * its striations turning slowly round the axis; a dark wall cloud lowers
 * beneath it; a grey curtain of rain hangs off to one side; an anvil
 * spreads overhead.  The flat plains below are lit by the last sun through
 * the gap under the storm, a road and fence posts running to the horizon.
 * Lightning glows inside the cloud with the kick.
 *
 *   sceneTime/sceneAdvance -> the rotation of the striations (continuous)
 *   audioKick    -> intracloud lightning glow (light only)
 *   audioBass    -> the darkness of the wall cloud (light)
 *   audioSwell   -> the sunset light (slow)
 *   audioCentroid-> colour temperature of the sunset
 *
 * Per-activation variety:
 *   cloudP float tiers and bulk of the storm (0.5..2.2)
 *   stormP float strength of the lightning (0.5..2.0)
 *   speedP float rotation speed (0.5..2.0)
 *   hueP   float sky hue offset (0..6.28)
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
uniform float audioCentroid;   ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float cloudP;
uniform float stormP;
uniform float speedP;   ///< Speed knob, 0..1.
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
    for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.7; a *= 0.5; }
    return v;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float cp = clamp((cloudP > 0.01) ? cloudP : 1.0, 0.5, 2.2);
    float sp = (stormP > 0.01) ? stormP : 1.0;
    float spd = (speedP > 0.01) ? speedP : 1.0;
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float kick = clamp(audioKick, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.5;

    float horizon = -0.3;
    vec3 sunC = mix(vec3(1.0, 0.6, 0.25), vec3(1.0, 0.8, 0.5), clamp(audioCentroid, 0.0, 1.0)) * (0.85 + 0.35 * swell);
    sunC = mix(sunC, imgPalette(0.08 + hue * 0.159), 0.12);

    // Sky: green-teal storm light overhead, gold under the storm to the left.
    vec3 col = mix(vec3(0.95, 0.62, 0.3) * sunC, vec3(0.14, 0.22, 0.26), smoothstep(-0.3, 0.15, p.y));
    col = mix(col, vec3(0.07, 0.1, 0.14), smoothstep(0.1, 0.5, p.y));
    col += sunC * exp(-length(p - vec2(-0.85, -0.26)) * 4.0) * 0.6;

    // The anvil: a wide flat overhang spreading right across the top.
    float anvilB = 0.3 - 0.06 * p.x + 0.04 * (fbm(vec2(p.x * 3.0, 1.0)) - 0.5);
    if (p.y > anvilB) {
        float tex = fbm(vec2(p.x * 2.5 - T * 0.004, p.y * 5.0));
        vec3 ac = mix(vec3(0.12, 0.15, 0.2), vec3(0.3, 0.33, 0.38), tex);
        ac += sunC * 0.3 * exp(-(p.y - anvilB) * 12.0) * smoothstep(0.3, -0.7, p.x);       // lit underside edge
        // Mammatus: round pouches hanging from the anvil's underside.
        float pouch = smoothstep(0.45, 0.75, fbm(vec2(p.x * 9.0, p.y * 12.0) + 4.0));
        ac *= 0.85 + 0.25 * pouch * exp(-(p.y - anvilB) * 10.0);
        col = mix(col, ac, smoothstep(0.0, 0.02, p.y - anvilB));
    }

    // The mesocyclone: stacked tiers round a vertical axis.
    vec2 axis = vec2(-0.05, 0.0);
    float base = -0.08;
    float top = anvilB + 0.02;
    float y = p.y;
    float tiers = 4.0 + 2.0 * cp;
    float ty = (y - base) / (top - base);                 // 0..1 up the updraft
    // A bell: broad over the flat base, narrowing into the anvil.
    float wB = (0.4 + 0.1 * cp) * (0.78 + 0.3 * sin(3.14159 * clamp(ty * 0.85 + 0.1, 0.0, 1.0))) * (1.0 - 0.35 * ty * ty);
    float bulge = 0.008 * sin(ty * tiers * 3.14159 * 2.0 + 1.0);
    float w = wB + bulge + 0.04 * (fbm(vec2(y * 7.0, p.x * 2.0)) - 0.5);
    float dx = p.x - axis.x;
    // Seen from a little below: each tier's lower edge is an ellipse arc.
    float arc = 0.06 * (1.0 - clamp(dx * dx / (w * w), 0.0, 1.0));
    if (ty > -0.05 && ty < 1.02 && abs(dx) < w) {
        float phi = asin(clamp(dx / w, -1.0, 1.0));       // azimuth on the visible side
        // Striations: bands along each tier, dragged round by the rotation.
        float band = fract(ty * tiers + arc * 8.0);
        float striae = fbm(vec2(phi * 3.0 - T * 0.05 * spd, (y + arc) * 70.0)) * 0.6 + fbm(vec2(phi * 8.0 - T * 0.05 * spd, (y + arc) * 20.0)) * 0.4;
        float shelf = smoothstep(0.0, 0.15, band) * smoothstep(1.0, 0.7, band);
        // Light: the left (sunset) side glows, the right is steel-blue shade.
        float lit = smoothstep(0.6, -0.9, phi);
        vec3 shade = vec3(0.12, 0.17, 0.24);
        vec3 c = mix(shade, sunC * 0.9, lit * (0.6 + 0.4 * shelf));
        c *= 0.6 + 0.6 * striae;
        c += sunC * pow(1.0 - band, 16.0) * lit * 0.3;         // lip on each tier
        // Soft outline against the sky.
        float edge = smoothstep(w, w - 0.03, abs(dx));
        col = mix(col, c, edge * smoothstep(-0.05, 0.02, ty) * smoothstep(1.02, 0.95, ty));
    }
    // The wall cloud: a dark lowered block under the base, turning.
    {
        float wy = base - 0.07;
        float ww = 0.17 + 0.02 * sin(T * 0.1 * spd);
        vec2 wq = p - vec2(axis.x + 0.03, wy);
        // Rounded, ragged underneath, merging up into the base.
        float wn = fbm(vec2(p.x * 12.0, 5.0));
        float wr = length(vec2(wq.x / ww, (wq.y - 0.04) / (0.1 + 0.03 * wn)));
        float wall = smoothstep(1.0, 0.55, wr + 0.25 * (fbm(p * 18.0) - 0.5)) * step(wq.y, 0.07) * 0.9;
        float wt = fbm(vec2(asin(clamp(wq.x / ww, -1.0, 1.0)) * 2.0 - T * 0.08 * spd, wq.y * 30.0));
        vec3 wc = vec3(0.1, 0.13, 0.16) * (0.7 + 0.6 * wt) * (1.0 - 0.3 * clamp(audioBass, 0.0, 1.0));
        wc += sunC * 0.15 * smoothstep(0.1, -0.2, wq.x);
        col = mix(col, wc, wall);
    }
    // Rain curtain off to the right: translucent grey streaks to the ground.
    {
        float rx = p.x - 0.45 - 0.2 * (p.y - base);
        float curtain = smoothstep(0.25, 0.0, abs(rx)) * step(p.y, base) * step(horizon, p.y);
        float streak = 0.6 + 0.4 * noise2(vec2(rx * 120.0, p.y * 4.0 + T * 2.0));
        col = mix(col, vec3(0.3, 0.35, 0.42), curtain * 0.65 * streak);
    }
    // Lightning glowing inside the cloud on the kick (light only).
    {
        float g1 = exp(-length((p - vec2(0.2, 0.18)) * vec2(1.0, 1.6)) * 5.0);
        float g2 = exp(-length((p - vec2(-0.25, 0.1)) * vec2(1.0, 1.5)) * 6.0);
        float which = 0.5 + 0.5 * sin(audioAdvance * 1.3);
        col += vec3(0.75, 0.8, 1.0) * (g1 * which + g2 * (1.0 - which)) * kick * 0.8 * sp * step(base, p.y);
    }

    // The plains: dark, lit gold toward the left, a road and fence posts.
    if (p.y < horizon) {
        float d = horizon - p.y;
        float z = 0.1 / d;
        vec3 field = mix(vec3(0.25, 0.18, 0.08), vec3(0.08, 0.07, 0.05), smoothstep(-0.8, 0.4, p.x));
        field *= 0.7 + 0.3 * noise2(vec2(p.x * z * 20.0, z * 3.0));
        field += sunC * 0.25 * exp(-d * 6.0) * smoothstep(0.2, -0.8, p.x);
        // The road: converging to a point on the horizon.
        float rx = p.x / d * 0.1 - 0.02;
        float road = smoothstep(0.03, 0.026, abs(rx));
        field = mix(field, vec3(0.12, 0.11, 0.1) + sunC * 0.05, road);
        field += vec3(0.8, 0.7, 0.4) * smoothstep(0.0012, 0.0, abs(rx)) * 0.15;    // centre line
        // Fence posts along the right of the road.
        float fx = (p.x / d * 0.1 - 0.07);
        float post = step(abs(fx), 0.0015) * step(fract(z * 2.0), 0.15);
        field = mix(field, vec3(0.02), post * step(0.01, d));
        col = field;
    }
    col += sunC * exp(-abs(p.y - horizon) * 120.0) * 0.25 * smoothstep(0.3, -0.8, p.x);

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
