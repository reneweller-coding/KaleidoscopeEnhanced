#version 330 core
out vec4 fragColor;
/**
 * @file CrepuscularRaysForest.frag
 * @brief CREPUSCULAR RAYS FOREST: sun shafts through mist between tall
 * trunks.  The rays fan from a sun low behind the wood; each ray carries
 * one spectrum band, so the fan reads the music across its width.  The
 * mist drifts on the scene clock and the sun sinks over the scene arc,
 * swinging the fan and warming its colour.  Pollen floats as round motes
 * where the light is.  The photo is the wood.  Camera fixed on the path.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> brightness of each ray across the fan (light)
 *   sceneAdvance      -> mist drift and pollen (continuous)
 *   sceneProgress     -> the sun sinks, the fan swings (the arc)
 *   audioSwell        -> mist density (slow)
 *   audioHigh         -> pollen sparkle (light)
 *
 * Per-activation variety: raysP, mistP, hueP.
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
uniform float audioSpectrum[32];
uniform float audioSwell;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float raysP;
uniform float mistP;
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
    float rays = 14.0 + floor(clamp(raysP, 0.0, 1.0) * 14.0);           // once per activation
    float mist = (0.5 + 0.6 * clamp(mistP, 0.0, 1.0)) * (0.5 + 0.7 * clamp(audioSwell, 0.0, 1.0));
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float clock = sceneAdvance * 0.4 + sceneTime * 0.08;
    float prog = clamp(sceneProgress, 0.0, 1.0);
    // The sun sinks over the arc and drifts to the left, so the fan swings.
    vec2 sun = vec2(mix(0.34, -0.1, prog) * aspect, mix(0.42, 0.1, prog));
    // Its colour warms as it sinks.
    vec3 sunCol = mix(vec3(1.0, 0.95, 0.8), vec3(1.0, 0.62, 0.3), prog);
    sunCol = mix(sunCol, imgPalette(hue * 0.159 + 0.08), 0.25);

    // The wood: the photo, dim and green-blue away from the light.
    vec3 wood = img(uv) * mix(vec3(0.4, 0.45, 0.38), imgPalette(hue * 0.159 + 0.3), 0.3);
    wood *= 0.5 + 0.5 * fbm(p * 6.0 + 3.0);
    vec3 col = wood * (0.3 + 0.35 * mist);
    // Trunks: dark vertical bars at fixed positions, wider when nearer.
    for (int i = 0; i < 9; ++i)
    {
        float fi = float(i);
        float tx = (hash11(fi * 3.1) - 0.5) * aspect * 2.0;
        float w = 0.012 + 0.05 * hash11(fi * 5.3);
        float lean = (hash11(fi * 7.7) - 0.5) * 0.06;
        float d = abs(p.x - tx - lean * p.y);
        float trunk = smoothstep(w, w * 0.8, d);
        vec3 bark = img(clamp(vec2(0.1 + fi * 0.09, uv.y * 0.8), 0.0, 1.0)) * vec3(0.4, 0.33, 0.26);
        bark *= 0.6 + 0.5 * noise2(vec2(p.x * 200.0, p.y * 12.0));
        // Nearer trunks are darker against the mist.
        col = mix(col, bark * (0.25 + 0.35 * (1.0 - w * 12.0)), trunk);
        // The rim that faces the sun catches light.
        float rimSide = sign(sun.x - tx);
        col += sunCol * smoothstep(w, w * 0.6, abs(d - w * 0.7)) * step(0.0, rimSide * (p.x - tx)) * trunk * 0.25 * (1.0 - prog * 0.4);
    }
    // The rays.  Angle from the sun; each ray is one spectrum band.
    vec2 rel = p - sun;
    float ang = atan(rel.y, rel.x);
    float dist = length(rel);
    // The fan opens downward-right from the sun; only that wedge carries rays.
    float wedge = smoothstep(-2.9, -2.2, ang) * smoothstep(0.35, -0.3, ang);
    float rayIdx = (ang + 3.14159) / 6.2831853 * rays;
    float cellF = fract(rayIdx);
    int band = int(mod(floor(rayIdx) * 2.0 + 1.0, 32.0));
    float e = clamp(audioSpectrum[band] * 1.7, 0.0, 1.0);
    // A ray is a soft wedge; its own slow shimmer comes from the mist.
    float shape = pow(0.5 + 0.5 * cos((cellF - 0.5) * 6.2831853), 2.2);
    float shimmer = 0.7 + 0.5 * fbm(vec2(ang * 6.0, dist * 3.0 - clock * 0.5));
    float ray = shape * wedge * shimmer * smoothstep(0.02, 0.5, dist) * exp(-dist * 0.9);
    col += sunCol * ray * mist * (0.18 + 1.0 * e) * 1.6;
    // The sun's own glow behind the trees.
    col += sunCol * exp(-dist * 3.2) * (0.35 + 0.4 * mist);
    col += sunCol * exp(-dist * 12.0) * 0.6;
    // Mist body: brighter toward the light, drifting on the clock.
    float body = fbm(p * 2.2 + vec2(clock * 0.15, clock * 0.04));
    col += sunCol * mist * body * exp(-dist * 1.6) * 0.35;
    // Pollen: round motes drifting up, lit only inside the fan.
    for (int layer = 0; layer < 2; ++layer)
    {
        float fl = float(layer);
        float scale = 26.0 + fl * 16.0;
        vec2 g = (p + vec2(sin(clock * 0.4 + fl) * 0.04, -clock * (0.02 + 0.015 * fl))) * scale + fl * 21.0;
        vec2 c = floor(g); vec2 f = fract(g) - 0.5;
        vec2 jit = vec2(hash21(c + 1.3), hash21(c + 5.9)) - 0.5;
        float mote = smoothstep(0.17, 0.05, length(f - jit * 0.7)) * step(0.9, hash21(c + fl * 7.3));
        col += sunCol * mote * (0.35 + 0.9 * hi) * (0.3 + ray * 3.0) * 1.2;
    }
    // The floor: ferns and litter, darker, catching a little of the light.
    float floorMask = smoothstep(-0.18, -0.42, p.y);
    col = mix(col, col * vec3(0.7, 0.85, 0.6) * 0.8, floorMask * 0.6);
    col += sunCol * floorMask * exp(-dist * 1.4) * 0.15;
    col *= 0.85 + 0.3 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
