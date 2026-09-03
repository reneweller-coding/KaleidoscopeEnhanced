#version 330 core
out vec4 fragColor;
/**
 * @file ProtoplanetaryDiscRings.frag
 * @brief PROTOPLANETARY DISC: a young star's dust disc seen from above at
 * an angle, divided into 32 rings -- the 32 bands of the spectrum analyser.
 * Each ring glows with its own band, bass inside, treble at the rim, so a
 * chord is a set of bright rings and a cymbal a flash at the edge.  Three
 * planets plough their gaps and carry the disc's rotation (Keplerian, on
 * the music's pace).  The spectrum analyser as a solar system; the camera
 * never moves.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> ring brightness (the whole point)
 *   sceneAdvance      -> disc rotation, planets orbit (continuous)
 *   audioLevel        -> star glow
 *   audioSwell        -> disc haze (slow)
 *   audioKick         -> the star flashes
 *
 * Per-activation variety: tiltP (viewing angle), gapP (planet gap width), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioLevel;
uniform float audioSwell;
uniform float audioKick;
uniform float audioChromaHue;
uniform float audioValence;

uniform float tiltP;
uniform float gapP;
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

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float tilt = 0.35 + 0.35 * clamp(tiltP, 0.0, 1.0);        // 1 = face-on
    float gapW = 0.02 + 0.03 * clamp(gapP, 0.0, 1.0);

    // View: the disc plane foreshortened by the tilt, shifted down a little.
    vec2 q = vec2(p.x, (p.y + 0.08) / tilt);
    float r = length(q);
    float a = atan(q.y, q.x);

    // 32 rings between rIn and rOut.
    const float rIn = 0.10, rOut = 1.15;
    float u = clamp((r - rIn) / (rOut - rIn), 0.0, 0.9999);
    int band = int(u * 32.0);
    float e = clamp(audioSpectrum[band] * 1.6, 0.0, 1.0);
    float within = fract(u * 32.0);
    float ringEdge = smoothstep(0.0, 0.15, within) * smoothstep(1.0, 0.85, within);

    // Keplerian rotation of the dust: inner faster.
    float omega = 0.9 / pow(max(r, 0.1), 1.5);
    float phi = a - sceneAdvance * omega - sceneTime * 0.04 * omega;
    float dust = 0.55 + 0.45 * noise2(vec2(phi * 3.0, r * 18.0));
    dust *= 0.7 + 0.3 * noise2(vec2(phi * 9.0 + 5.0, r * 40.0));

    // Three planets on circular orbits carve gaps; each is a bright dot.
    vec3 col = vec3(0.0);
    float gap = 1.0;
    float planetLight = 0.0;
    for (int k = 0; k < 3; ++k)
    {
        float pr = 0.32 + 0.3 * float(k);
        float pw = 0.9 / pow(pr, 1.5);
        float pa = sceneAdvance * pw + sceneTime * 0.04 * pw + float(k) * 2.1;
        gap *= 1.0 - 0.85 * exp(-pow((r - pr) / gapW, 2.0));
        vec2 pp = pr * vec2(cos(pa), sin(pa));
        float d = length(q - pp);
        planetLight += exp(-d * 90.0) * 1.2 + exp(-d * 25.0) * 0.2;
    }

    vec3 ringCol = imgPalette(hue * 0.159 + u * 0.8);
    float inDisc = smoothstep(rIn - 0.02, rIn + 0.02, r) * (1.0 - smoothstep(rOut - 0.05, rOut + 0.05, r));
    col += ringCol * dust * gap * inDisc * (0.12 + 1.3 * e) * (0.7 + 0.3 * ringEdge);
    // Haze between rings on the swell.
    col += ringCol * inDisc * 0.08 * clamp(audioSwell, 0.0, 1.0);
    col += imgPalette(hue * 0.159 + 0.95) * planetLight * inDisc;

    // The star: a glow at the centre, flashing on the kick.
    float sr = length(vec2(p.x, p.y + 0.08));
    col += mix(imgPalette(hue * 0.159 + 0.95), vec3(1.0, 0.95, 0.8), 0.6) * (exp(-sr * 14.0) * (1.2 + 1.5 * audioKick) + exp(-sr * 4.0) * (0.15 + 0.3 * audioLevel));
    // Background: faint stars.
    vec2 cell = floor(p * 70.0); vec2 f = fract(p * 70.0) - 0.5;
    col += vec3(step(0.986, hash21(cell)) * exp(-dot(f, f) * 9.0)) * 0.45 * (1.0 - inDisc);

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
