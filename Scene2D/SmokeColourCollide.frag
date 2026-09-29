#version 330 core
out vec4 fragColor;
/**
 * @file SmokeColourCollide.frag
 * @brief SMOKE COLOUR COLLIDE: two streams of coloured smoke blown into each
 * other against black -- one magenta from the left, one cyan-teal from
 * the right, lit hard from the side like a studio smoke photograph.
 * Where they meet they curl up into billowing vortices and fine filaments,
 * rolling over one another, their colours mixing to violet and white at
 * the seam, wisps tearing off and fading into the dark.  The streams flow
 * steadily; the camera is still.
 *
 * The smoke is advected by a curl-noise velocity field (divergence-free),
 * so the filaments roll and stretch like real smoke.
 *
 * Audio Reactivity:
 *   audioSwell  -> the density of the smoke (slow)
 *   audioBass   -> the glow where the colours meet (light)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the streams flowing (continuous)
 *
 * Per-activation variety: turbP (how turbulent), hueP (the pair of colours).
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneTime;
uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioBass;
uniform float audioLevel;
uniform float audioValence;
uniform float audioChromaHue;

uniform float turbP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

float hash21(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}
float fbm3(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}

float gT;

// Curl of a scalar potential: a divergence-free velocity field.
vec2 curl(vec2 p)
{
    float e = 0.05;
    vec2 q = p + vec2(0.0, gT * 0.05);
    float n1 = fbm3(q + vec2(0.0, e)), n2 = fbm3(q - vec2(0.0, e));
    float n3 = fbm3(q + vec2(e, 0.0)), n4 = fbm3(q - vec2(e, 0.0));
    return vec2(n1 - n2, n4 - n3) / (2.0 * e);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    gT = sceneTime + sceneAdvance * 0.4;
    float turb = 0.6 + 0.8 * clamp(turbP, 0.0, 1.0);

    // Trace the point back along the flow to find where its smoke came from:
    // the streams enter from the sides, a rising drift plus the curl field.
    vec2 q = p;
    for (int i = 0; i < 10; ++i) {
        vec2 v = curl(q * 2.2) * 0.05 * turb + vec2(0.0, 0.025);
        q -= v;
    }
    // The two streams: dense near their nozzles, spreading as they travel
    // (the nozzles sit low, so the rising drift centres the collision).
    q.y += 0.22;
    float flow = gT * 0.18;
    float left = smoothstep(0.35, 0.0, abs(q.y + 0.05 * sin(q.x * 3.0 + flow))) * smoothstep(0.35, -0.9, q.x);
    float right = smoothstep(0.35, 0.0, abs(q.y - 0.05 * sin(q.x * 3.0 - flow))) * smoothstep(-0.35, 0.9, q.x);
    // Density detail: filaments stretched by the flow.
    float fil = fbm(q * vec2(5.0, 9.0) + vec2(-flow, 0.0));
    float fil2 = fbm(q * vec2(5.0, 9.0) + vec2(flow, 3.0));
    float dL = left * smoothstep(0.3, 0.75, fil) * (0.7 + 0.6 * swell);
    float dR = right * smoothstep(0.3, 0.75, fil2) * (0.7 + 0.6 * swell);
    // The colours: a complementary pair, turned by hueP.
    float h = hueP * 0.3;
    vec3 cL = 0.5 + 0.5 * cos(6.2831853 * (h + 0.9 + vec3(0.0, 0.33, 0.67)));
    vec3 cR = 0.5 + 0.5 * cos(6.2831853 * (h + 0.45 + vec3(0.0, 0.33, 0.67)));
    cL = mix(cL, imgPalette(0.9 + hueP * 0.159), 0.1) * 1.3;
    cR = mix(cR, imgPalette(0.45 + hueP * 0.159), 0.1) * 1.3;
    // Side lighting: the smoke's edges facing the light glow, the far side is shadowed.
    float e = 0.01;
    float gx = fbm(q * vec2(5.0, 9.0) + vec2(-flow, 0.0) + vec2(e * 5.0, 0.0)) - fil;
    float lit = clamp(0.6 - gx * 20.0, 0.2, 1.4);
    vec3 col = cL * dL * lit + cR * dR * lit;
    // Where they meet: white-violet heat.
    float meet = sqrt(dL * dR);
    col += vec3(1.0, 0.9, 1.0) * meet * (0.6 + 1.2 * bass);
    // Wisps fading into the dark.
    col *= smoothstep(0.75, 0.3, abs(p.y));

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
