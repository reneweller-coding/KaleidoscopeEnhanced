#version 330 core
out vec4 fragColor;
/**
 * @file RotoreliefIllusion.frag
 * @brief ROTORELIEF ILLUSION: the rotating discs of Duchamp -- eccentric
 * circles and spirals that, turning, seem to bulge and sink.  A field of
 * discs, one per chroma class, each turning steadily on the scene clock at
 * its own rate; the class that sounds lights its disc.  The eccentric rings
 * carry the photo in bands; the illusion of depth comes from the turn, not
 * from the camera, which never moves.
 *
 * Audio Reactivity:
 *   sceneAdvance    -> disc rotation (continuous)
 *   audioChroma[12] -> disc brightness per class (light)
 *   audioKick       -> disc centres flash (light)
 *   audioSwell      -> ring contrast (slow)
 *   audioLevel      -> brightness
 *
 * Per-activation variety: eccP (eccentricity), ringsP, hueP.
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
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float eccP;
uniform float ringsP;
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

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float ecc = 0.12 + 0.2 * clamp(eccP, 0.0, 1.0);
    float rings = 5.0 + 6.0 * clamp(ringsP, 0.0, 1.0);

    // Twelve discs in a 4 x 3 field; each disc has its own rate and sense.
    vec2 cellSz = vec2(aspect / 4.0, 1.0 / 3.0);
    vec2 g = (p + vec2(aspect, 1.0) * 0.5) / cellSz;
    vec2 ci = floor(g);
    vec2 cf = fract(g) - 0.5;
    int k = int(clamp(ci.x + ci.y * 4.0, 0.0, 11.0));
    float fk = float(k);
    float e = clamp(audioChroma[k] * 1.5, 0.0, 1.0);
    float rate = (0.6 + 0.6 * hash11(fk * 3.7)) * (hash11(fk * 5.1) > 0.5 ? 1.0 : -1.0);
    float rot = sceneAdvance * rate + sceneTime * 0.1 * rate + hash11(fk * 9.3) * 6.28;
    vec2 q = cf * vec2(cellSz.x / cellSz.y, 1.0);          // square coordinates
    float rad = 0.44;
    float r = length(q);

    vec3 col;
    if (r < rad)
    {
        // Eccentric circles: each ring i is centred at an offset that
        // rotates with the disc and grows with i; ring membership by the
        // distance to its own centre -> the bulge illusion when turning.
        float c2 = cos(rot), s2 = sin(rot);
        vec2 off = vec2(c2, s2) * ecc;
        float best = 1e9; float ringId = 0.0;
        for (int i = 0; i < 12; ++i)
        {
            if (float(i) >= rings) break;
            float fi = float(i);
            float rr = rad * (fi + 0.5) / rings;
            vec2 cc = off * (1.0 - fi / rings) * 0.9;
            float dd = abs(length(q - cc) - rr);
            if (dd < best) { best = dd; ringId = fi; }
        }
        float lineW = 0.018;
        float line = smoothstep(lineW, lineW * 0.4, best);
        // The band between the lines carries the photo, sampled by ring.
        float band = fract(ringId / rings + rot * 0.05);
        vec3 photo = img(vec2(band, 0.5 + 0.4 * sin(atan(q.y, q.x) + rot)));
        vec3 base = mix(imgPalette(hue * 0.159 + fk / 12.0), photo * 1.5, 0.5) + 0.12;
        float contrast = 0.4 + 0.5 * clamp(audioSwell, 0.0, 1.0);
        col = base * (0.7 + 0.6 * e) * (1.0 - line * contrast);
        col += (imgPalette(hue * 0.159 + 0.9) + 0.3) * line * (0.5 + 0.8 * e);
        // The centre flashes on the kick for the sounding class.
        col += imgPalette(hue * 0.159 + 0.95) * exp(-r * 18.0) * (0.2 + 1.0 * audioKick * e);
        // Disc rim.
        col = mix(col, vec3(0.1), smoothstep(0.012, 0.0, rad - r));
    }
    else
    {
        // The table between the discs: the photo dim and soft.
        col = img(fract(vec2(p.x * 0.4 + 0.5, p.y * 0.6 + 0.5))) * (imgPalette(hue * 0.159 + 0.55) * 0.6 + 0.15);
    }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
