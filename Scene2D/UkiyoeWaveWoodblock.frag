#version 330 core
out vec4 fragColor;
/**
 * @file UkiyoeWaveWoodblock.frag
 * @brief UKIYO-E WAVE WOODBLOCK: a great wave in the manner of the
 * woodblock print -- flat colour fields in Prussian blue and cream, the
 * black key line, the foam claws as rows of round dots, the paper grain.
 * The wave rises and curls over the scene arc (its crest reaching further
 * with the swell, slowly), the far mountain sits under it; the photo is
 * the print paper and the sky's colour field.  The kick brightens the
 * claws, the treble the spray dots.  Camera fixed: it is a print.
 *
 * Audio Reactivity:
 *   sceneProgress -> the wave's rise and curl (the arc)
 *   audioSwell    -> crest reach (slow)
 *   audioKick     -> claw light (light)
 *   audioHigh     -> spray dots (light)
 *   audioLevel    -> brightness
 *
 * Per-activation variety: crestP, blueP, hueP.
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
uniform float audioSwell;
uniform float audioKick;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float crestP;
uniform float blueP;
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
    float crest = 0.6 + 0.4 * clamp(crestP, 0.0, 1.0);
    float prog = clamp(sceneProgress, 0.0, 1.0);
    float reach = (0.3 + 0.7 * smoothstep(0.0, 0.8, prog)) * crest * (0.85 + 0.3 * clamp(audioSwell, 0.0, 1.0));
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    vec3 blue = mix(vec3(0.1, 0.2, 0.45), imgPalette(hue * 0.159 + 0.62), 0.25 * clamp(blueP, 0.0, 1.0));
    vec3 blueLight = mix(vec3(0.35, 0.55, 0.75), imgPalette(hue * 0.159 + 0.58), 0.2);
    vec3 cream = vec3(0.93, 0.87, 0.72);
    vec3 ink = vec3(0.1, 0.09, 0.1);

    // The paper: cream with the photo as a faint grain and the sky field.
    vec3 paper = cream * (0.92 + 0.08 * noise2(p * 200.0));
    vec3 skyField = mix(paper, img(gl_FragCoord.xy / resolution) * cream * 1.1, 0.35);
    vec3 col = mix(skyField, paper, smoothstep(0.1, 0.5, p.y));
    // The far mountain under the wave: a small cone with a snow cap.
    float mtn = step(p.y, -0.05 + 0.18 * (1.0 - abs(p.x - 0.25) * 4.0)) * step(abs(p.x - 0.25), 0.25);
    col = mix(col, blue * 0.9, mtn);
    col = mix(col, cream, mtn * step(0.06, p.y));
    // The wave: a curling crest from the left, rising with reach; its body
    // a band of blue with lighter stripes (the woodblock's water lines),
    // the underside darker, the crest edge a black key line, the claws a
    // row of round foam dots along the curl.
    // Wave profile: height as a function of x, plus the curl over the top.
    float wx = (p.x + aspect * 0.5) / aspect;                          // 0 left .. 1 right
    float body = -0.45 + 0.9 * reach * pow(smoothstep(0.0, 0.75, wx) * (1.0 - smoothstep(0.75, 0.95, wx)), 0.8);
    float inWave = step(p.y, body);
    // The curl: the crest bends over to the right at the top: a circle-ish lobe.
    vec2 cc = vec2(-aspect * 0.5 + aspect * 0.72, body + 0.02);
    float curlR = 0.18 * reach;
    vec2 cq = p - cc;
    float curl = step(length(cq), curlR) * step(0.0, cq.x) * step(-0.2, cq.y) * (1.0 - step(length(cq - vec2(0.05, -0.1)), curlR * 0.55) * step(cq.y, 0.0));
    float wave = max(inWave, curl);
    // Water lines: lighter stripes following the profile.
    float stripes = pow(0.5 + 0.5 * sin((p.y - body) * 60.0 + p.x * 20.0), 6.0);
    vec3 water = mix(blue, blueLight, stripes * 0.8);
    water = mix(water, blue * 0.7, smoothstep(0.0, 0.35, body - p.y));   // darker deep in the body
    col = mix(col, water, wave);
    // The key line at the crest and the curl edge.
    float edgeLine = smoothstep(0.008, 0.0, abs(p.y - body)) * step(0.05, wx) * step(wx, 0.95);
    edgeLine = max(edgeLine, smoothstep(0.008, 0.0, abs(length(cq) - curlR)) * step(0.0, cq.x));
    col = mix(col, ink, edgeLine * 0.9);
    // Foam claws: round dots along the crest and the curl edge, brighter on
    // the kick; spray dots above in the air, on the treble.
    float along = wx * 40.0;
    float claw = smoothstep(0.35, 0.15, length(vec2(fract(along) - 0.5, (p.y - body - 0.02) * 40.0))) * step(0.2, wx) * step(wx, 0.9);
    float curlAng = atan(cq.y, cq.x);
    float clawCurl = smoothstep(0.35, 0.15, length(vec2(fract(curlAng * 3.0) - 0.5, (length(cq) - curlR) * 40.0))) * step(0.0, cq.x) * step(0.0, curlAng);
    col = mix(col, cream * (1.0 + 0.12 * audioKick), max(claw, clawCurl));
    vec2 su = p * 50.0; vec2 sc = floor(su); vec2 sf = fract(su) - 0.5;
    vec2 so = vec2(hash21(sc + 1.3), hash21(sc + 5.9)) - 0.5;
    float spray = smoothstep(0.2, 0.08, length(sf - so * 0.6)) * step(0.95, hash21(sc)) * step(body, p.y) * step(p.y, body + 0.25) * step(0.3, wx);
    col = mix(col, cream, spray * (0.4 + 0.6 * hi));
    // The print's border and the cartouche.
    float border = step(aspect * 0.47, abs(p.x)) + step(0.47, abs(p.y));
    col = mix(col, cream * 0.95, clamp(border, 0.0, 1.0));
    col = mix(col, vec3(0.75, 0.2, 0.15), step(abs(p.x - aspect * 0.42), 0.02) * step(abs(p.y - 0.36), 0.06));
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
