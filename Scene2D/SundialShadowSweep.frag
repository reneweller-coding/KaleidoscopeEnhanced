#version 330 core
out vec4 fragColor;
/**
 * @file SundialShadowSweep.frag
 * @brief SUNDIAL SHADOW SWEEP: a garden sundial from above.  The gnomon
 * throws its shadow across the dial and the shadow sweeps the hour lines
 * over the scene arc; as it goes the light warms from morning through
 * noon to evening and the shadow lengthens again.  Each hour numeral
 * lights as the shadow passes it, taking the colour of a chroma class.
 * The photo is the weathered bronze of the plate.  Camera fixed above.
 *
 * Audio Reactivity:
 *   sceneProgress   -> the shadow sweeps the day (the arc)
 *   audioChroma[12] -> the numerals as the shadow reaches them (light)
 *   audioSwell      -> the sunlight (slow)
 *   audioHigh       -> the bronze sheen (light)
 *   audioKick       -> a cloud shadow passes (light, broad and soft)
 *
 * Per-activation variety: hoursP, mossP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float sceneProgress;
uniform float audioAdvance;
uniform float audioChroma[12];
uniform float audioSwell;
uniform float audioHigh;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float hoursP;
uniform float mossP;
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
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = p * 2.03 + 3.7; a *= 0.5; } return v; }

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float hours = 9.0 + floor(clamp(hoursP, 0.0, 1.0) * 4.0);           // hour lines shown
    float moss = 0.3 + 0.8 * clamp(mossP, 0.0, 1.0);
    float sun = 0.6 + 0.55 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float prog = clamp(sceneProgress, 0.0, 1.0);
    float clock = sceneAdvance * 0.4 + sceneTime * 0.08;

    // The day: the sun climbs and sinks over the arc.
    float elev = sin(prog * 3.14159);                                    // 0 at dawn/dusk, 1 at noon
    // The shadow angle sweeps from morning to evening.
    float shadowA = mix(-2.2, 0.9, prog);
    float shadowLen = mix(0.44, 0.16, elev);
    vec3 sunCol = mix(vec3(1.0, 0.55, 0.32), vec3(1.0, 0.97, 0.86), smoothstep(0.1, 0.65, elev));
    sunCol = mix(sunCol, imgPalette(hue * 0.159 + 0.1), 0.2);
    // A cloud passing: the kick makes it deeper, but its motion is on the clock.
    float cloud = smoothstep(0.45, 0.75, fbm(p * 1.2 + vec2(clock * 0.12, 0.0)));
    float shade = 1.0 - (0.2 + 0.4 * audioKick) * cloud;

    // The lawn around the dial.
    vec3 grass = img(uv * 1.6) * mix(vec3(0.28, 0.42, 0.2), imgPalette(hue * 0.159 + 0.33), 0.3);
    grass *= 0.6 + 0.5 * fbm(p * 30.0);
    vec3 col = grass * sun * shade;

    // The dial plate.
    float r = length(p * vec2(1.0, 1.05));
    float plateR = 0.36;
    float onPlate = smoothstep(plateR, plateR - 0.006, r);
    if (onPlate > 0.002)
    {
        // Weathered bronze: the photo as its patina, with a turned finish.
        vec3 bronze = mix(vec3(0.55, 0.45, 0.24), imgPalette(hue * 0.159 + 0.12), 0.3);
        bronze = mix(bronze, bronze * (0.5 + 1.0 * img(clamp(p * 1.2 + 0.5, 0.0, 1.0))), 0.4);
        bronze *= 0.75 + 0.35 * sin(r * 220.0);                          // lathe rings
        // Verdigris in the low places.
        float verd = smoothstep(0.5, 0.75, fbm(p * 9.0 + 5.0)) * moss;
        bronze = mix(bronze, mix(vec3(0.25, 0.5, 0.38), imgPalette(hue * 0.159 + 0.4), 0.3), verd * 0.55);
        vec3 plate = bronze * sun * shade;

        // The hour lines and numerals.
        float a = atan(p.y, p.x);
        for (int k = 0; k < 13; ++k)
        {
            float fk = float(k);
            if (fk >= hours) break;
            float ha = mix(-2.5, 1.2, fk / (hours - 1.0));
            vec2 dir = vec2(cos(ha), sin(ha));
            // The line: from the centre out to the rim.
            float t = clamp(dot(p, dir), 0.0, plateR);
            float lineD = length(p - dir * t);
            float major = (mod(fk, 3.0) < 0.5) ? 1.0 : 0.55;
            float line = smoothstep(0.004 * major + 0.002, 0.001, lineD) * step(plateR * 0.35, t);
            // Which class this hour takes, and whether the shadow is on it.
            int cls = int(mod(fk, 12.0));
            float e = clamp(audioChroma[cls] * 1.6, 0.0, 1.0);
            float near = smoothstep(0.25, 0.0, abs(ha - shadowA));
            vec3 lineCol = mix(vec3(0.2, 0.15, 0.08), imgPalette(hue * 0.159 + float(cls) / 12.0) * 1.4, 0.3 + 0.5 * near);
            plate = mix(plate, lineCol, line * 0.9);
            plate += imgPalette(hue * 0.159 + float(cls) / 12.0) * line * near * e * 0.9;
            // The numeral: a small mark near the rim, lit as the shadow arrives.
            vec2 np = dir * (plateR * 0.82);
            float num = 0.0;
            for (int m = 0; m < 4; ++m)
            {
                float fm = float(m);
                vec2 o = vec2(hash11(fk * 3.1 + fm) - 0.5, hash11(fk * 5.7 + fm) - 0.5) * 0.035;
                num = max(num, smoothstep(0.008, 0.004, length(p - np - o)));
            }
            plate = mix(plate, mix(vec3(0.15, 0.1, 0.05), imgPalette(hue * 0.159 + float(cls) / 12.0) * 1.5, 0.3 + 0.6 * near), num);
            plate += imgPalette(hue * 0.159 + float(cls) / 12.0) * num * near * (0.4 + 0.9 * e);
        }
        // The rim ring.
        plate = mix(plate, bronze * 1.4 * sun, smoothstep(0.008, 0.0, abs(r - plateR * 0.93)));
        // The bronze sheen on the treble: a broad specular sweep.
        plate += vec3(1.0, 0.95, 0.8) * exp(-pow((dot(p, vec2(0.6, 0.8)) - 0.1) * 5.0, 2.0)) * (0.1 + 0.4 * hi) * sun * shade;
        col = mix(col, plate, onPlate);
    }
    // The gnomon and its shadow.  The shadow first, so the gnomon sits on it.
    vec2 sdir = vec2(cos(shadowA), sin(shadowA));
    float st = clamp(dot(p, sdir), 0.0, shadowLen);
    float sd = length(p - sdir * st);
    // The shadow widens with distance, as a real penumbra does.
    float sw = 0.012 + 0.03 * (st / max(shadowLen, 1e-3));
    float shadow = smoothstep(sw, sw * 0.4, sd) * step(0.0, dot(p, sdir));
    col *= 1.0 - 0.55 * shadow * onPlate * (0.5 + 0.5 * elev);
    col *= 1.0 - 0.3 * shadow * (1.0 - onPlate);
    // The gnomon: a triangular plate standing on the dial, pointing north.
    vec2 gdir = vec2(0.0, 1.0);
    float gt = clamp(dot(p, gdir), 0.0, 0.3);
    float gd = abs(dot(p, vec2(1.0, 0.0)));
    float gnomon = step(gd, 0.014 + 0.0 * gt) * step(0.0, dot(p, gdir)) * step(dot(p, gdir), 0.3 - gd * 4.0);
    vec3 gnCol = mix(vec3(0.5, 0.4, 0.2), imgPalette(hue * 0.159 + 0.1), 0.25) * sun * shade;
    gnCol *= 0.6 + 0.6 * smoothstep(-0.01, 0.01, p.x);
    col = mix(col, gnCol, gnomon);
    col += vec3(1.0, 0.95, 0.85) * smoothstep(0.004, 0.0, abs(p.x)) * gnomon * (0.2 + 0.5 * hi);
    col *= 0.9 + 0.2 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
