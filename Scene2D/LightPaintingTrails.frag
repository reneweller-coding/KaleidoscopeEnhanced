#version 330 core
out vec4 fragColor;
/**
 * @file LightPaintingTrails.frag
 * @brief LIGHT PAINTING TRAILS: a long exposure in a dark room.  A dancer
 * swings light wands and the shutter keeps everything: the trails hang in
 * the air as continuous ribbons, brightest where the wand is now and
 * fading along their age.  Each wand owns a chroma class and brightens
 * with it; the trail geometry runs on the scene clock, so nothing jumps.
 * The kick is the flash that freezes a silhouette of the dancer for an
 * instant.  The photo is the dark room behind.  Camera fixed on the tripod.
 *
 * Audio Reactivity:
 *   sceneAdvance    -> the wands travel, trails age (continuous)
 *   audioChroma[12] -> per-wand brightness (light)
 *   audioKick       -> the flash and the frozen silhouette (light)
 *   audioSwell      -> exposure length: how far back the trails reach (slow)
 *   audioHigh       -> sparkle along the newest part (light)
 *
 * Per-activation variety: wandsP, lobesP, hueP.
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
uniform float audioKick;
uniform float audioSwell;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float wandsP;
uniform float lobesP;
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

// Where wand w is at time t: a Lissajous-like figure, drifting slowly so
// the painting never repeats exactly on top of itself.
vec2 wandAt(float w, float t, float lobes, float aspect)
{
    float a = 1.0 + mod(w, 3.0);
    float b = lobes + mod(w * 1.7, 2.0);
    float ph = w * 1.3;
    vec2 c = vec2(0.34 * aspect * sin(a * t + ph),
                  0.3 * sin(b * t * 0.83 + ph * 1.7));
    // A slow drift of the whole figure, so the ribbons braid over time.
    c += vec2(0.1 * sin(t * 0.11 + w), 0.07 * cos(t * 0.09 + w * 2.0));
    return c;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float wands = 2.0 + floor(clamp(wandsP, 0.0, 1.0) * 3.0);           // once per activation
    float lobes = 2.0 + floor(clamp(lobesP, 0.0, 1.0) * 3.0);
    float expose = 2.6 + 3.4 * clamp(audioSwell, 0.0, 1.0);             // seconds of trail
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float t = sceneAdvance * 0.9 + sceneTime * 0.18;

    // The room: the photo, very dark, as a long exposure sees it.
    vec3 col = img(uv) * mix(vec3(0.1, 0.1, 0.12), imgPalette(hue * 0.159 + 0.6) * 0.2, 0.5);
    col += vec3(0.012, 0.012, 0.02);
    col *= 0.6 + 0.4 * (1.0 - length(p) * 0.7);

    // The trails.  Walk backwards in time along each wand's path and lay
    // down a soft line segment for every step; the weight falls with age,
    // which is exactly what an open shutter records.
    const int STEPS = 56;
    for (int w = 0; w < 5; ++w)
    {
        if (float(w) >= wands) break;
        float fw = float(w);
        int cls = int(mod(fw * 5.0 + 2.0, 12.0));
        float e = clamp(audioChroma[cls] * 1.6, 0.0, 1.0);
        vec3 wc = imgPalette(hue * 0.159 + float(cls) / 12.0) * 1.6 + 0.15;
        vec2 prev = wandAt(fw, t, lobes, aspect);
        float best = 1e9, bestAge = 1.0;
        for (int s = 1; s <= STEPS; ++s)
        {
            float age = float(s) / float(STEPS);                         // 0 = now, 1 = oldest
            vec2 cur = wandAt(fw, t - age * expose, lobes, aspect);
            // Distance to the segment (prev, cur) -- a sampled point set
            // would draw a dotted line.
            vec2 d = cur - prev;
            float u = clamp(dot(p - prev, d) / max(dot(d, d), 1e-6), 0.0, 1.0);
            float dist = length(p - (prev + d * u));
            float ageU = (float(s) - 1.0 + u) / float(STEPS);
            if (dist < best) { best = dist; bestAge = ageU; }
            prev = cur;
        }
        // The ribbon: a bright core with a soft halo, both fading with age.
        float fade = pow(1.0 - bestAge, 1.6);
        float core = smoothstep(0.007, 0.0015, best);
        float halo = exp(-best * 42.0);
        col += wc * core * fade * (0.5 + 1.1 * e) * 1.5;
        col += wc * halo * fade * (0.25 + 0.6 * e) * 0.7;
        // Sparkle on the freshest stretch, on the treble.
        col += vec3(1.0) * core * smoothstep(0.25, 0.0, bestAge) * hi * 0.5;
        // The wand head itself: a small bright point where the light is now.
        vec2 head = wandAt(fw, t, lobes, aspect);
        float dh = length(p - head);
        col += wc * (smoothstep(0.016, 0.004, dh) * 1.8 + exp(-dh * 26.0) * 0.8) * (0.4 + 0.9 * e);
    }
    // The flash: a silhouette of the dancer, frozen for the instant of the
    // kick.  A body shape at the centre, dark against the trails, with a
    // rim of flash light -- and it only ever appears where the body is.
    float bodyD;
    {
        vec2 b = p - vec2(0.04 * sin(t * 0.2), -0.16);
        float torso = length((b - vec2(0.0, 0.12)) * vec2(2.4, 1.0)) - 0.12;
        float head = length(b - vec2(0.0, 0.3)) - 0.055;
        float legs = length(vec2(abs(b.x) - 0.045, b.y + 0.02) * vec2(3.4, 1.0)) - 0.09;
        float arms = length(vec2(abs(b.x) - 0.13, b.y - 0.2) * vec2(1.0, 3.0)) - 0.1;
        bodyD = min(min(torso, head), min(legs, arms));
    }
    float silhouette = smoothstep(0.01, -0.01, bodyD);
    float flash = audioKick;
    col = mix(col, col * 0.25, silhouette * smoothstep(0.05, 0.35, flash));
    col += vec3(0.9, 0.92, 1.0) * smoothstep(0.02, 0.0, abs(bodyD)) * flash * 1.2;
    col *= 0.85 + 0.3 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
