#version 330 core
out vec4 fragColor;
/**
 * @file PuddleNeonReflections.frag
 * @brief PUDDLE NEON REFLECTIONS: a wet street at night, seen low.  The
 * upper half is the shopfront signs (the photo, in chroma-class colours);
 * the lower half is their reflection in the puddles, broken by rings from
 * falling drops and by the wind ruffling the surface.  Rings expand on
 * continuous phases, so no ring ever pops into being; the kick is a
 * heavier drop with a wider ring.  The swell is how hard it rains.
 * Camera fixed at kerb height.
 *
 * Audio Reactivity:
 *   audioChroma[12] -> sign colours (light)
 *   audioSwell      -> rain density (slow)
 *   sceneAdvance    -> rings expand, rain falls (continuous)
 *   audioKick       -> a heavier drop (light and one wider ring)
 *   audioHigh       -> the wet sparkle on the asphalt (light)
 *
 * Per-activation variety: signsP, rainP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioChroma[12];
uniform float audioSwell;
uniform float audioKick;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float signsP;
uniform float rainP;
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
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = p * 2.03 + 5.1; a *= 0.5; } return v; }

// The street above the waterline: signs on both sides, dark between them.
vec3 streetAbove(vec2 s, float hue, float signs, float clock)
{
    vec3 col = img(clamp(vec2(s.x * 0.5 + 0.5, s.y * 0.6 + 0.35), 0.0, 1.0))
             * mix(vec3(0.16, 0.16, 0.2), imgPalette(hue * 0.159 + 0.6) * 0.3, 0.5);
    col *= 0.5 + 0.5 * smoothstep(-0.05, 0.5, s.y);
    // Signs: bright rectangles at fixed places, one chroma class each.
    for (int i = 0; i < 10; ++i)
    {
        float fi = float(i);
        if (fi >= signs) break;
        int cls = int(mod(fi * 5.0 + 1.0, 12.0));
        float e = clamp(audioChroma[cls] * 1.6, 0.0, 1.0);
        vec3 sc = imgPalette(hue * 0.159 + float(cls) / 12.0) * 1.6 + 0.2;
        vec2 c = vec2((hash11(fi * 3.1) - 0.5) * 1.5, 0.08 + 0.34 * hash11(fi * 5.3));
        vec2 hb = vec2(0.03 + 0.1 * hash11(fi * 7.7), 0.012 + 0.05 * hash11(fi * 11.3));
        vec2 d = abs(s - c) - hb;
        float box = smoothstep(0.012, 0.0, max(d.x, d.y));
        // Tube letters inside: a striped pattern, not a solid block.
        float tube = 0.35 + 0.65 * smoothstep(0.35, 0.65, fbm((s - c) * 40.0 + fi * 7.0));
        col += sc * box * tube * (0.5 + 1.3 * e);
        col += sc * exp(-length((s - c) / max(hb, vec2(0.02))) * 1.6) * (0.1 + 0.5 * e) * 0.7;
    }
    // Street lamps: warm points high up.
    for (int i = 0; i < 3; ++i)
    {
        float fi = float(i);
        vec2 c = vec2((fi - 1.0) * 0.55, 0.42);
        col += vec3(1.0, 0.75, 0.45) * exp(-length(s - c) * 9.0) * 0.5;
        col += vec3(1.0, 0.8, 0.5) * smoothstep(0.02, 0.008, length(s - c)) * 1.4;
    }
    return col;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float signs = 5.0 + floor(clamp(signsP, 0.0, 1.0) * 5.0);           // once per activation
    float rain = (0.35 + 0.8 * clamp(rainP, 0.0, 1.0)) * (0.4 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float clock = sceneAdvance * 0.6 + sceneTime * 0.12;
    float horizon = -0.02;

    vec3 col;
    if (p.y > horizon)
    {
        col = streetAbove(vec2(p.x, p.y - horizon), hue, signs, clock);
    }
    else
    {
        // The reflection: the street mirrored about the waterline, with the
        // sample point displaced by the ripple field.  The further below the
        // line, the nearer the water is to the camera and the more it breaks.
        float depth = (horizon - p.y);
        vec2 mirrored = vec2(p.x, horizon - p.y - horizon);
        // Wind ruffle: a slow horizontal smear that grows with distance.
        float ruffle = (fbm(vec2(p.x * 7.0, p.y * 22.0 + clock * 0.6)) - 0.5) * (0.02 + 0.12 * depth);
        // Rings: drops land on continuous phases and their rings expand.
        float ringDisp = 0.0;
        float ringLight = 0.0;
        for (int i = 0; i < 10; ++i)
        {
            float fi = float(i);
            float ph = fract(clock * (0.35 + 0.2 * hash11(fi * 3.7)) + hash11(fi * 5.9));
            vec2 c = vec2((hash11(fi * 7.1) - 0.5) * aspect * 1.6,
                          horizon - 0.04 - 0.42 * hash11(fi * 9.3));
            float d = length((p - c) * vec2(1.0, 2.4));
            float radius = ph * (0.18 + 0.1 * hash11(fi * 11.7));   // never scaled by an envelope: a ring in flight must not jump
            float ring = exp(-abs(d - radius) * 55.0) * (1.0 - ph) * smoothstep(0.0, 0.08, ph);
            ringDisp += ring * 0.035 * sign(d - radius);
            ringLight += ring * (1.0 + 0.8 * audioKick);
        }
        vec2 s = vec2(mirrored.x + ruffle + ringDisp, mirrored.y * (0.85 + 0.3 * depth) + ringDisp * 0.4);
        vec3 refl = streetAbove(s, hue, signs, clock);
        // Wet asphalt under the reflection.
        vec3 road = img(clamp(vec2(uv.x, 0.1 + depth * 0.3), 0.0, 1.0))
                  * mix(vec3(0.1, 0.1, 0.12), imgPalette(hue * 0.159 + 0.05) * 0.2, 0.4);
        road *= 0.7 + 0.5 * fbm(vec2(p.x * 40.0, p.y * 90.0));
        // Reflectivity: grazing angles (far, near the waterline) reflect most.
        float fres = exp(-depth * 3.4);
        col = mix(road, refl * 0.95, 0.25 + 0.7 * fres);
        // The rings themselves catch the light.
        col += vec3(0.8, 0.85, 0.95) * ringLight * (0.35 + 0.5 * fres) * 0.5;
        // Kerb line just below the horizon.
        col = mix(col, vec3(0.3, 0.3, 0.33), smoothstep(0.012, 0.0, abs(p.y - horizon + 0.012)) * 0.5);
        // Wet sparkle on the asphalt: round, jittered, on the treble.
        vec2 gg = vec2(p.x * 90.0, p.y * 220.0);
        vec2 gc = floor(gg); vec2 gf = fract(gg) - 0.5;
        vec2 gj = vec2(hash21(gc + 1.3), hash21(gc + 5.9)) - 0.5;
        float spark = smoothstep(0.22, 0.07, length(gf - gj * 0.7)) * step(0.94, hash21(gc));
        col += vec3(1.0) * spark * hi * 0.5 * (0.3 + fres);
    }
    // The rain itself: round drops falling across the whole frame.
    for (int layer = 0; layer < 2; ++layer)
    {
        float fl = float(layer);
        float scale = 30.0 + fl * 22.0;
        vec2 g = vec2(p.x + sin(clock * 0.3 + fl) * 0.02, p.y + clock * (0.9 + 0.5 * fl)) * scale + fl * 17.0;
        vec2 c = floor(g); vec2 f = fract(g) - 0.5;
        vec2 j = vec2(hash21(c + 1.7), hash21(c + 8.1)) - 0.5;
        // A drop is a short streak: round across, stretched along the fall.
        float d = length((f - j * 0.7) * vec2(1.0, 0.35));
        float drop = smoothstep(0.2, 0.06, d) * step(1.0 - 0.1 * rain, hash21(c + fl * 3.3));
        col += vec3(0.75, 0.82, 0.95) * drop * (0.25 + 0.35 * hi) * (0.7 - fl * 0.2);
    }
    col *= 0.85 + 0.3 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
