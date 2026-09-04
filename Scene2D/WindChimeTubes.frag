#version 330 core
out vec4 fragColor;
/**
 * @file WindChimeTubes.frag
 * @brief WIND CHIME TUBES: a chime hanging on a porch.  Twelve tubes, one
 * per chroma class, hang from a disc and sway gently on the scene clock;
 * the clapper drifts among them.  A tube does not move when its note
 * sounds -- it RINGS: it brightens and throws a halo of rings, which is
 * how a struck tube reads and keeps the whole frame free of jolts.  The
 * photo is the garden beyond the porch.  Camera fixed on the chime.
 *
 * Audio Reactivity:
 *   audioChroma[12] -> which tubes ring (light and their halos)
 *   sceneAdvance    -> the sway and the clapper drift (continuous)
 *   audioSwell      -> the afternoon light (slow)
 *   audioKick       -> the clapper's own glint (light)
 *   audioHigh       -> the metal sheen (light)
 *
 * Per-activation variety: lengthP, swayP, hueP.
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

uniform float lengthP;
uniform float swayP;
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
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = p * 2.03 + 8.1; a *= 0.5; } return v; }

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float longest = 0.46 + 0.14 * clamp(lengthP, 0.0, 1.0);
    float swayAmt = (0.2 + 0.8 * clamp(swayP, 0.0, 1.0)) * 0.035;
    float day = 0.65 + 0.55 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float clock = sceneAdvance * 0.4 + sceneTime * 0.08;

    // The garden beyond: the photo, bright and out of focus.
    vec3 garden = img(uv * 0.9 + 0.05);
    vec3 col = mix(garden * 1.3, vec3(0.7, 0.78, 0.65), 0.25) * day;
    col *= 0.75 + 0.35 * fbm(p * 3.0 + vec2(clock * 0.1, 0.0));
    // The porch: a dark eave across the top with a hook.
    float eave = step(0.4, p.y);
    col = mix(col, mix(vec3(0.16, 0.12, 0.09), imgPalette(hue * 0.159 + 0.08) * 0.25, 0.4) * day, eave);
    float hook = smoothstep(0.008, 0.004, length(p - vec2(0.0, 0.4))) ;
    col = mix(col, vec3(0.45, 0.45, 0.48) * day, hook);

    // The suspension disc.
    float discY = 0.3;
    float disc = smoothstep(0.16, 0.15, length((p - vec2(0.0, discY)) * vec2(1.0, 3.2)));
    vec3 wood = mix(vec3(0.5, 0.35, 0.2), imgPalette(hue * 0.159 + 0.1), 0.25);
    wood *= 0.8 + 0.3 * noise2(p * 60.0);
    // The cord from the hook to the disc.
    col = mix(col, vec3(0.7, 0.65, 0.55) * day, smoothstep(0.004, 0.002, abs(p.x)) * step(discY, p.y) * step(p.y, 0.4));

    // The tubes: twelve, hung in a ring, seen from the front so they read
    // as a row with the nearer ones lower.
    float ringGlow = 0.0;
    vec3 ringCol = vec3(0.0);
    for (int i = 0; i < 12; ++i)
    {
        float fi = float(i);
        float a = fi / 12.0 * 6.2831853;
        // The ring seen at an angle: x across, a small y offset for depth.
        float x0 = sin(a) * 0.15;
        float depth = 0.5 + 0.5 * cos(a);                                // 1 = nearest
        float top = discY - 0.02 - (1.0 - depth) * 0.015;
        // Length: the lowest class is the longest tube.
        float len = longest * (0.55 + 0.45 * (1.0 - fi / 12.0));
        // The sway: the whole chime swings gently, nearer tubes further.
        float sway = swayAmt * sin(clock * 0.7 + a * 0.5) * (0.5 + 0.5 * depth);
        float x = x0 + sway;
        float e = clamp(audioChroma[i] * 1.6, 0.0, 1.0);
        vec3 tc = imgPalette(hue * 0.159 + fi / 12.0) * 1.5 + 0.2;
        float rad = (0.012 + 0.006 * (1.0 - fi / 12.0)) * (0.75 + 0.35 * depth);
        vec2 q = p - vec2(x, 0.0);
        float onTube = step(abs(q.x), rad) * step(top - len, p.y) * step(p.y, top);
        if (onTube > 0.5)
        {
            float across = q.x / max(rad, 1e-3);
            // Anodised aluminium: a bright core and a dark edge.
            vec3 metal = mix(vec3(0.72, 0.74, 0.78), tc, 0.2 + 0.45 * e);
            metal *= 0.35 + 0.85 * sqrt(max(1.0 - across * across, 0.0));
            metal *= 0.6 + 0.5 * depth;
            // The ringing tube glows along its whole length.
            metal += tc * e * (0.4 + 0.5 * sqrt(max(1.0 - across * across, 0.0)));
            metal += vec3(1.0) * smoothstep(0.5, 0.0, abs(across + 0.35)) * (0.15 + 0.5 * hi);
            // The open end catches a rim of light.
            metal += vec3(1.0, 0.98, 0.9) * smoothstep(0.012, 0.0, abs(p.y - (top - len))) * (0.3 + 0.5 * e);
            col = mix(col, metal * day, onTube);
        }
        // The cord to the disc.
        col = mix(col, vec3(0.75, 0.7, 0.6) * day,
                  smoothstep(0.0025, 0.001, abs(p.x - x)) * step(top, p.y) * step(p.y, discY - 0.01) * 0.9);
        // The halo: concentric rings from the ringing tube.  Light only.
        vec2 hq = p - vec2(x, top - len * 0.55);
        float hr = length(hq * vec2(1.0, 0.7));
        float rings = pow(0.5 + 0.5 * cos(hr * 55.0 - clock * 5.0), 3.0);
        ringGlow += rings * exp(-hr * 5.0) * e;
        ringCol += tc * rings * exp(-hr * 5.0) * e;
        ringCol += tc * exp(-hr * 9.0) * e * 0.4;
    }
    col += ringCol * 0.55;
    // The disc over the tubes.
    col = mix(col, wood * day, disc);
    col += vec3(1.0, 0.95, 0.85) * disc * hi * 0.15;
    // The clapper: a round disc hanging on its own cord, drifting.
    float cx = 0.055 * sin(clock * 0.5) + 0.03 * sin(clock * 0.31 + 1.0);
    float cy = discY - longest * 0.62;
    col = mix(col, vec3(0.7, 0.65, 0.55) * day,
              smoothstep(0.0025, 0.001, abs(p.x - cx * (p.y - discY) / max(cy - discY, 1e-3)))
              * step(cy, p.y) * step(p.y, discY - 0.01) * 0.8);
    float clap = smoothstep(0.03, 0.026, length(p - vec2(cx, cy)));
    col = mix(col, wood * 1.2 * day, clap);
    col += vec3(1.0, 0.95, 0.85) * clap * audioKick * 0.6;
    // The sail below the clapper.
    float sail = step(abs(p.x - cx * 1.1), 0.035) * step(cy - 0.16, p.y) * step(p.y, cy - 0.05);
    col = mix(col, mix(vec3(0.6, 0.4, 0.25), imgPalette(hue * 0.159 + 0.15), 0.3) * day, sail);
    col *= 0.9 + 0.2 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
