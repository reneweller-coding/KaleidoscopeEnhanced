#version 330 core
out vec4 fragColor;
/**
 * @file ShepardPitchHelix.frag
 * @brief SHEPARD PITCH HELIX: pitch as a helix -- one turn per octave,
 * the twelve chroma classes around it, octaves stacked as floors -- seen
 * side-on, turning slowly on the scene clock.  The melody history (96
 * samples) winds up the helix as a glowing thread of round beads, the
 * newest at the head; each class's post on the helix lights with its
 * chroma energy; the kick lights the current note; the photo is the hall
 * behind.  Camera still.
 *
 * Audio Reactivity:
 *   audioMelody[96] / audioMelodyHead -> the thread (continuous history)
 *   audioChroma[12]  -> class posts (light)
 *   sceneAdvance     -> helix rotation (continuous)
 *   audioKick        -> the current note flashes (light)
 *   audioLevel       -> brightness
 *
 * Per-activation variety: turnsP (octaves shown), radiusP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioMelody[96];
uniform float audioMelodyHead;
uniform float audioChroma[12];
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float turnsP;
uniform float radiusP;
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

float melodyAgo(int k)
{
    int head = int(audioMelodyHead * 96.0 + 0.5);
    int i = (head - k + 960) % 96;
    return audioMelody[i];
}

// Helix point for a pitch value (0..1 spans the shown octaves) at rotation rot.
vec3 helixPoint(float pitch, float turns, float R, float rot)
{
    float ang = pitch * turns * 6.2831853 + rot;
    return vec3(cos(ang) * R, (pitch - 0.5) * 0.8, sin(ang) * R);
}

vec2 project(vec3 q)
{
    float persp = 1.0 / (1.0 + q.z * 0.35);
    return vec2(q.x * persp, q.y * persp);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float turns = 2.0 + 2.0 * clamp(turnsP, 0.0, 1.0);
    float R = 0.28 + 0.12 * clamp(radiusP, 0.0, 1.0);
    float rot = sceneAdvance * 0.2 + sceneTime * 0.04;

    // The hall: the photo dim behind.
    vec3 col = (interpolation * textureLod(tex0, gl_FragCoord.xy / resolution, 3.0) + (1.0 - interpolation) * textureLod(tex1, gl_FragCoord.xy / resolution, 3.0)).rgb;
    col *= imgPalette(hue * 0.159 + 0.6) * 0.8 + 0.05;
    col *= 0.6 + 0.4 * (1.0 - length(p) * 0.7);

    // The helix rail: sampled finely, drawn as a thin line, with the class
    // posts (12 per turn) as small discs lit by their chroma.
    float rail = 0.0; vec3 railCol = vec3(0.0);
    for (int s = 0; s < 160; ++s)
    {
        float t = float(s) / 160.0;
        vec3 q = helixPoint(t, turns, R, rot);
        vec2 sp = project(q);
        float depth = 0.6 + 0.4 * (1.0 - (q.z + R) / (2.0 * R));
        float d = length(p - sp);
        rail = max(rail, smoothstep(0.006, 0.002, d) * depth);
    }
    col += vec3(0.6, 0.65, 0.75) * rail * 1.2;
    for (int k = 0; k < 48; ++k)
    {
        float fk = float(k);
        if (fk >= turns * 12.0) break;
        float t = (fk + 0.5) / (turns * 12.0);
        int cls = int(mod(fk, 12.0));
        float e = clamp(audioChroma[cls] * 1.5, 0.0, 1.0);
        vec3 q = helixPoint(t, turns, R, rot);
        vec2 sp = project(q);
        float depth = 0.6 + 0.4 * (1.0 - (q.z + R) / (2.0 * R));
        float d = length(p - sp);
        vec3 pc = imgPalette(hue * 0.159 + float(cls) / 12.0) * 1.5 + 0.15;
        col += pc * (smoothstep(0.018, 0.01, d) * (0.6 + 0.9 * e) + exp(-d * 30.0) * e * 0.5) * depth;
    }
    // The melody thread: beads for the last 96 samples along the helix.
    for (int k = 0; k < 96; ++k)
    {
        float m = melodyAgo(k);
        if (m <= 0.001) continue;
        float age = float(k) / 96.0;
        vec3 q = helixPoint(clamp(m, 0.0, 1.0), turns, R, rot);
        vec2 sp = project(q);
        float depth = 0.6 + 0.4 * (1.0 - (q.z + R) / (2.0 * R));
        float d = length(p - sp);
        float sz = 0.014 * (1.0 - age * 0.6);
        vec3 bc = imgPalette(hue * 0.159 + 0.9) * 1.6 + 0.2;
        float bead = smoothstep(sz, sz * 0.5, d) * (1.0 - age * 0.85) * depth;
        col += bc * bead;
        if (k == 0) col += bc * exp(-d * 20.0) * (0.4 + 0.8 * audioKick);
    }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
