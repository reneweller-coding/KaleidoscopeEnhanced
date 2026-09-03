#version 330 core
out vec4 fragColor;
/**
 * @file PipeOrganChroma.frag
 * @brief PIPE ORGAN CHROMA: the organ front -- ranks of pipes, one pipe per
 * pitch class and octave, their heights following the harmonic series
 * (the lowest class the tallest pipe), arranged in the classic mitre.  A
 * pipe that sounds glows at its mouth and its speaking length shimmers;
 * the whole front is lit by the swell (the organ swell box, literally),
 * the kick brings the pedal pipes up in light.  The photo is the case
 * behind and the pipe metal.  Nothing moves but light; camera still.
 *
 * Audio Reactivity:
 *   audioChroma[12]   -> which pipes speak (light)
 *   audioSpectrum[32] -> octave weighting (light)
 *   audioSwell        -> swell-box light (slow)
 *   audioKick         -> pedal rank light (light)
 *   audioLevel        -> brightness
 *
 * Per-activation variety: ranksP, metalP, hueP.
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
uniform float audioSpectrum[32];
uniform float audioSwell;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float ranksP;
uniform float metalP;
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
    float ranks = floor(2.0 + 2.0 * clamp(ranksP, 0.0, 1.0));    // 2..4 ranks (octaves)
    float metal = clamp(metalP, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);

    // The case: the photo as dark carved wood behind the pipes.
    vec3 col = img(gl_FragCoord.xy / resolution) * mix(vec3(0.18), imgPalette(hue * 0.159 + 0.55) * 0.35, 0.5);
    col *= 0.6 + 0.4 * swell;

    // Pipes: 12 per rank, ranks side by side across the front; within a
    // rank the pipes are arranged as a mitre (tallest at the centre of the
    // rank, alternating outwards), heights from the harmonic series.
    float nPipes = 12.0 * ranks;
    float pw = aspect / nPipes;                       // pipe pitch across
    float xi = (p.x + aspect * 0.5) / pw;
    float pipeIdx = floor(xi);
    float within = fract(xi) - 0.5;
    float rank = floor(pipeIdx / 12.0);
    float pos = mod(pipeIdx, 12.0);                    // position within the rank
    // Mitre order: position 0..11 -> class ordering from the centre out.
    float fromCentre = abs(pos - 5.5);                 // 0.5 .. 5.5
    float cls = mod(floor(fromCentre * 2.0) + (pos > 5.5 ? 1.0 : 0.0) + rank * 5.0, 12.0);
    int k = int(cls);
    float e = clamp(audioChroma[k] * 1.5, 0.0, 1.0);
    // Octave weighting: the rank's band of the spectrum.
    int band = int(clamp(rank * 8.0 + 3.0, 0.0, 31.0));
    float oct = clamp(audioSpectrum[band] * 1.5, 0.0, 1.0);
    // Height: harmonic series -- the lowest class the tallest, scaled per rank.
    float h = 0.9 / (1.0 + cls * 0.09) * (1.0 - rank * 0.12) - fromCentre * 0.02;
    float foot = -0.45;
    float top = foot + h;
    float radius = pw * 0.42 * (1.0 - rank * 0.05);
    float body = step(abs(within) * pw, radius) * step(foot, p.y) * step(p.y, top);
    if (body > 0.5)
    {
        // Cylinder shading: a highlight left of centre, metal from the photo.
        float nx = within * pw / radius;                 // -1..1 across the pipe
        float shade = sqrt(max(1.0 - nx * nx, 0.0));
        float spec = pow(max(1.0 - abs(nx + 0.35) * 2.2, 0.0), 6.0);
        vec3 tin = mix(vec3(0.75, 0.75, 0.72), vec3(0.85, 0.65, 0.35), metal);
        vec3 pm = mix(tin, img(vec2(fract(pipeIdx * 0.083), (p.y - foot) / h)) * 1.2, 0.35);
        vec3 pipe = pm * (0.25 + 0.55 * shade) + vec3(1.0) * spec * 0.5;
        pipe *= 0.55 + 0.45 * swell;
        // The mouth: a dark notch near the foot; it glows when the pipe speaks.
        float mouthY = foot + h * 0.16;
        float mouth = smoothstep(0.03, 0.0, abs(p.y - mouthY)) * step(abs(nx), 0.7);
        pipe = mix(pipe, vec3(0.05), mouth * 0.8);
        pipe += imgPalette(hue * 0.159 + cls / 12.0) * mouth * e * 2.0;
        // Speaking length shimmer: a standing wave of light up the pipe.
        float sw = 0.5 + 0.5 * sin((p.y - foot) / h * 6.2831853 * (1.0 + rank) - sceneAdvance * 4.0);
        pipe += imgPalette(hue * 0.159 + cls / 12.0) * sw * e * 0.45 * (0.5 + 0.5 * oct);
        // The pipe top: a bright rim.
        pipe += vec3(0.9) * smoothstep(0.012, 0.0, abs(p.y - top)) * 0.5;
        col = pipe;
    }
    else if (p.y < foot)
    {
        // The pedal rank below the impost: wide dark pipes lit on the kick.
        float px = fract(p.x * 2.5) - 0.5;
        float ped = smoothstep(0.45, 0.4, abs(px) * 2.0);
        col = mix(col, vec3(0.12, 0.1, 0.08) * (1.0 + 2.0 * audioKick) + imgPalette(hue * 0.159 + 0.1) * audioKick * 0.5, ped * 0.9);
        col += vec3(0.5, 0.4, 0.25) * smoothstep(0.01, 0.0, abs(p.y - foot + 0.01)) * 0.8;   // the impost
    }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
