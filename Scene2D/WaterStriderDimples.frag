#version 330 core
out vec4 fragColor;
/**
 * @file WaterStriderDimples.frag
 * @brief WATER STRIDER DIMPLES: a pond surface from just above.  The
 * striders themselves are thin dark lines, but what you actually see are
 * their six leg dimples: each foot presses the surface into a little lens
 * that gathers the light into a bright ring with a dark centre on the
 * bed below (the photo).  They glide on the scene clock and push out
 * rings on continuous phases.  The bass is the pond's own colour, the
 * treble the surface glitter, the kick a fish rising far off.
 *
 * Audio Reactivity:
 *   sceneAdvance -> the striders glide, rings expand (continuous)
 *   audioBass    -> pond colour and depth (slow)
 *   audioHigh    -> surface glitter (light)
 *   audioKick    -> a distant rise: one wider ring (light)
 *   audioSwell   -> daylight through the canopy (slow)
 *
 * Per-activation variety: bugsP, litterP, hueP.
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
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float bugsP;
uniform float litterP;
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
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = p * 2.03 + 6.1; a *= 0.5; } return v; }

// Where strider i is, and which way it faces.  It glides in short runs
// and turns slowly -- all continuous, nothing snaps.
vec2 striderAt(float i, float t, float aspect, out float heading)
{
    float sp = 0.06 + 0.05 * hash11(i * 3.7);
    float turn = t * (0.1 + 0.08 * hash11(i * 5.3)) + hash11(i * 7.1) * 6.28;
    // A slow wander: the direction turns, the position integrates it.
    vec2 c = vec2(sin(turn * 1.3 + i) * 0.45 * aspect, cos(turn + i * 2.0) * 0.32);
    c += vec2(sin(t * sp * 6.0 + i), cos(t * sp * 5.0 + i * 1.7)) * 0.06;
    heading = turn * 1.3 + i + 1.5708;
    return c;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float bugs = 3.0 + floor(clamp(bugsP, 0.0, 1.0) * 5.0);             // once per activation
    float litter = 0.3 + 0.9 * clamp(litterP, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float day = 0.6 + 0.55 * clamp(audioSwell, 0.0, 1.0);
    float clock = sceneAdvance * 0.5 + sceneTime * 0.1;

    // The bed below: the photo, green-brown, softened by the water.
    vec3 bed = img(uv * 1.15) * mix(vec3(0.35, 0.45, 0.3), imgPalette(hue * 0.159 + 0.35), 0.35);
    bed *= 0.55 + 0.5 * fbm(p * 8.0);
    // Depth colour: the pond gets darker and greener with the bass.
    bed = mix(bed, mix(vec3(0.06, 0.16, 0.14), imgPalette(hue * 0.159 + 0.45) * 0.25, 0.4), 0.3 + 0.35 * bass);
    vec3 col = bed * day;
    // Surface: a gentle ruffle that bends the light on the bed.
    float ruf = fbm(p * 12.0 + vec2(clock * 0.2, clock * 0.1));
    col *= 0.85 + 0.3 * ruf;

    // The dimples.  Each foot is a lens: a dark ring where the surface
    // curves away and a bright caustic inside it.
    float dimpleLight = 0.0;
    float dimpleDark = 0.0;
    for (int i = 0; i < 8; ++i)
    {
        float fi = float(i);
        if (fi >= bugs) break;
        float heading;
        vec2 c = striderAt(fi, clock, aspect, heading);
        vec2 fwd = vec2(cos(heading), sin(heading));
        vec2 side = vec2(-fwd.y, fwd.x);
        float scale = 0.75 + 0.5 * hash11(fi * 11.3);
        // The body: a thin dark line along the heading.
        float bodyT = clamp(dot(p - c, fwd) / (0.055 * scale), -1.0, 1.0);
        float bodyD = length(p - c - fwd * bodyT * 0.055 * scale);
        float body = smoothstep(0.007 * scale, 0.003 * scale, bodyD);
        col = mix(col, vec3(0.06, 0.06, 0.05), body * 0.85);
        // Six legs: three pairs, each with a foot that dimples the surface.
        for (int k = 0; k < 6; ++k)
        {
            float fk = float(k);
            float pair = floor(fk * 0.5);
            float sgn = (mod(fk, 2.0) < 0.5) ? 1.0 : -1.0;
            // The stroke: the middle pair rows, the others hold -- a smooth
            // oscillation on the clock, never a beat.
            float stroke = (pair == 1.0) ? 0.35 * sin(clock * 3.0 + fi * 2.0) : 0.08 * sin(clock * 1.1 + fi + pair);
            vec2 foot = c + fwd * ((pair - 1.0) * 0.075 + stroke * 0.05) * scale
                          + side * sgn * (0.075 + 0.05 * pair) * scale;
            // The leg itself: a hairline from body to foot.
            vec2 hip = c + fwd * (pair - 1.0) * 0.04 * scale;
            vec2 d2 = foot - hip;
            float t2 = clamp(dot(p - hip, d2) / max(dot(d2, d2), 1e-6), 0.0, 1.0);
            float legD = length(p - (hip + d2 * t2));
            col = mix(col, vec3(0.08, 0.08, 0.07), smoothstep(0.0035, 0.0015, legD) * 0.7);
            // The dimple: a lens of radius r.
            float r = 0.028 * scale;
            float dr = length(p - foot);
            dimpleLight += smoothstep(r * 0.85, r * 0.35, dr) * (1.0 - smoothstep(r * 0.3, 0.0, dr));
            dimpleDark  += smoothstep(r * 1.15, r * 0.85, dr) * smoothstep(r * 0.75, r * 0.95, dr);
        }
    }
    // The caustic ring under each foot, and the shadow rim around it.
    col += mix(vec3(1.0, 0.98, 0.85), imgPalette(hue * 0.159 + 0.1), 0.25) * clamp(dimpleLight, 0.0, 2.0) * day * 0.9;
    col *= 1.0 - 0.4 * clamp(dimpleDark, 0.0, 1.0);
    // Rings: from the strokes and, on the kick, one wider rise far off.
    for (int i = 0; i < 6; ++i)
    {
        float fi = float(i);
        float ph = fract(clock * (0.25 + 0.15 * hash11(fi * 3.3)) + hash11(fi * 5.7));
        vec2 c = vec2((hash11(fi * 7.7) - 0.5) * aspect * 1.5, (hash11(fi * 9.1) - 0.5) * 0.8);
        float rad = ph * (0.14 + 0.1 * hash11(fi * 11.3));          // radius stays continuous; the kick lights the ring instead
        float d = length(p - c);
        float ring = exp(-abs(d - rad) * 60.0) * (1.0 - ph) * smoothstep(0.0, 0.1, ph);
        col += mix(vec3(0.85, 0.95, 1.0), imgPalette(hue * 0.159 + 0.55), 0.3) * ring * (0.5 + 0.8 * audioKick) * day;
        col *= 1.0 - 0.12 * exp(-abs(d - rad * 0.92) * 60.0) * (1.0 - ph);
    }
    // Litter on the surface: round pollen and a few leaves.
    vec2 lg = p * 55.0; vec2 lc = floor(lg); vec2 lf = fract(lg) - 0.5;
    vec2 lj = vec2(hash21(lc + 2.1), hash21(lc + 6.7)) - 0.5;
    float pollen = smoothstep(0.2, 0.06, length(lf - lj * 0.7)) * step(1.0 - 0.08 * litter, hash21(lc));
    col += vec3(0.9, 0.88, 0.7) * pollen * 0.55 * day;
    // Surface glitter on the treble.
    vec2 gg = p * 130.0; vec2 gc = floor(gg); vec2 gf = fract(gg) - 0.5;
    vec2 gj = vec2(hash21(gc + 3.7), hash21(gc + 8.3)) - 0.5;
    float glint = smoothstep(0.2, 0.06, length(gf - gj * 0.7)) * step(0.95, hash21(gc));
    col += vec3(1.0) * glint * hi * 0.6;
    // Canopy shadow: a soft vignette of leaves overhead.
    col *= 0.75 + 0.4 * smoothstep(0.3, 0.7, fbm(p * 2.2 + 9.0));
    col *= 0.9 + 0.2 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
