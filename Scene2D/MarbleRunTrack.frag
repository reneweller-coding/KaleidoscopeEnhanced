#version 330 core
out vec4 fragColor;
/**
 * @file MarbleRunTrack.frag
 * @brief MARBLE RUN TRACK: a looping wooden track, and marbles (round,
 * glass, each a chroma class) rolling it on the scene clock -- down the
 * ramps, round the loops, through the funnel, back up the lift.  The
 * rail a marble rides lights in its class colour with that class's
 * energy; the kick is the bell at the bottom of the run; the photo is the
 * wall behind and the marbles' glass.  Camera fixed on the run.
 *
 * Audio Reactivity:
 *   sceneAdvance    -> the marbles' travel (continuous)
 *   audioChroma[12] -> rail light by class (light)
 *   audioKick       -> the bell (light)
 *   audioSwell      -> room light (slow)
 *   audioLevel      -> brightness
 *
 * Per-activation variety: marblesP, loopP, hueP.
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

uniform float marblesP;
uniform float loopP;
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

// The track as a closed parametric curve t in 0..1: a zigzag descent with
// two loops and a lift back up (a Lissajous-like path with vertical bias).
vec2 trackPos(float t, float loops)
{
    float a = t * 6.2831853;
    float x = 0.62 * sin(a) + 0.18 * sin(3.0 * a + 1.0) * loops;
    float y = 0.42 * cos(a) - 0.16 * sin(2.0 * a) + 0.08 * sin(5.0 * a) * loops;
    return vec2(x, y);
}

float trackDist(vec2 p, float loops, out float tAt)
{
    float best = 1e9; tAt = 0.0;
    vec2 prev = trackPos(0.0, loops);
    for (int s = 1; s <= 120; ++s)
    {
        float t = float(s) / 120.0;
        vec2 q = trackPos(t, loops);
        vec2 d = q - prev; float u = clamp(dot(p - prev, d) / max(dot(d, d), 1e-6), 0.0, 1.0);
        float dist = length(p - (prev + d * u));
        if (dist < best) { best = dist; tAt = t - (1.0 - u) / 120.0; }
        prev = q;
    }
    return best;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    int nMarbles = 6 + int(clamp(marblesP, 0.0, 1.0) * 6.0);
    float loops = 0.6 + 0.6 * clamp(loopP, 0.0, 1.0);
    float light = 0.8 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float clock = sceneAdvance * 0.12 + sceneTime * 0.025;

    // The wall: the photo, warm and dim.
    vec3 col = img(gl_FragCoord.xy / resolution) * mix(vec3(0.35), imgPalette(hue * 0.159 + 0.55) * 0.6, 0.5) * light;
    col *= 0.7 + 0.3 * (1.0 - length(p) * 0.6);
    // The track: two rails and a bed, wooden.
    float tAt;
    float d = trackDist(p, loops, tAt);
    float rail = smoothstep(0.03, 0.026, d) - smoothstep(0.018, 0.014, d);
    float bed = smoothstep(0.03, 0.02, d);
    vec3 wood = mix(vec3(0.55, 0.38, 0.2), img(fract(vec2(tAt * 3.0, d * 10.0))), 0.3) * light;
    col = mix(col, wood * 0.7, bed);
    col = mix(col, wood, rail);
    // Which marble is nearest along the track lights the rail here.
    for (int i = 0; i < 12; ++i)
    {
        if (i >= nMarbles) break;
        float fi = float(i);
        float tm = fract(clock + fi / float(nMarbles) + 0.02 * sin(sceneAdvance * 0.3 + fi));
        int k = int(mod(fi * 5.0, 12.0));
        float e = clamp(audioChroma[k] * 1.5, 0.0, 1.0);
        vec3 mc = imgPalette(hue * 0.159 + float(k) / 12.0) * 1.5 + 0.15;
        // Rail light near the marble along the track parameter (wrapped distance).
        float dt = abs(fract(tAt - tm + 0.5) - 0.5);
        float railLit = exp(-dt * 40.0) * rail;
        col += mc * railLit * (0.4 + 1.2 * e);
        // The marble: a glass sphere of the photo, class-tinted, with a highlight.
        vec2 mp = trackPos(tm, loops);
        vec2 q = p - mp;
        float r = 0.04;
        float dd = length(q);
        float disc = smoothstep(r, r * 0.9, dd);
        float sh = sqrt(max(1.0 - dd * dd / (r * r), 0.0));
        vec3 glass = img(clamp(q / r * 0.3 + 0.5, 0.0, 1.0));
        vec3 body = mix(glass * 1.2, mc, 0.45) * (0.4 + 0.7 * sh) * light * (0.7 + 0.5 * e);
        body += vec3(1.0) * pow(max(1.0 - length(q / r - vec2(-0.35, 0.35)) * 1.5, 0.0), 3.0) * 0.6;
        col = mix(col, body, disc);
        col += mc * exp(-dd * 40.0) * e * 0.4;
    }
    // The bell at the bottom of the run: a brass dome flashing on the kick.
    vec2 bell = trackPos(0.5, loops) + vec2(0.0, -0.06);
    float bd = length(p - bell);
    col = mix(col, vec3(0.85, 0.65, 0.3) * light * (0.5 + 0.5 * sqrt(max(1.0 - bd * bd / 0.0016, 0.0))), smoothstep(0.04, 0.036, bd));
    col += vec3(1.0, 0.9, 0.6) * exp(-bd * 15.0) * audioKick * 1.5;
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
