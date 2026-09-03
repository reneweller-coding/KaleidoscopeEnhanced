#version 330 core
out vec4 fragColor;
/**
 * @file BubbleChamberTracks.frag
 * @brief BUBBLE CHAMBER TRACKS: the physicist's photograph -- charged
 * particles spiralling in a magnetic field, their tracks as strings of
 * round bubbles.  Tracks are born on a continuous clock at a vertex, grow
 * along their spiral over their life, and fade; the onsets do not spawn
 * anything (that would be a cut) but light the tracks brighter as they
 * happen.  Curvature per track = charge and momentum, once at birth.  The
 * photo is the chamber wall behind the liquid.  Camera still.
 *
 * Audio Reactivity:
 *   sceneAdvance -> track birth and growth (continuous)
 *   audioOnset   -> track brightness (light)
 *   audioBass    -> the vertex glow (light)
 *   audioSwell   -> bubble density along the tracks (slow)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: curlP (field strength), tracksP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioOnset;
uniform float audioBass;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float curlP;
uniform float tracksP;
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

// Distance from p to the spiral track of a particle: start s, initial
// direction angle a0, curvature k (signed), drawn up to arc length len.
// The track is an arc of a circle whose radius shrinks slowly (energy
// loss) -- approximated by marching along the curve in short segments.
float trackDist(vec2 p, vec2 s, float a0, float k, float len, out float along)
{
    float best = 1e9; along = 0.0;
    vec2 q = s; float a = a0; float ds = 0.02;
    float travelled = 0.0;
    for (int i = 0; i < 64; ++i)
    {
        if (travelled > len) break;
        vec2 nq = q + vec2(cos(a), sin(a)) * ds;
        // Distance from p to the segment q..nq.
        vec2 d = nq - q; float t = clamp(dot(p - q, d) / dot(d, d), 0.0, 1.0);
        float dist = length(p - (q + d * t));
        if (dist < best) { best = dist; along = travelled + t * ds; }
        q = nq; travelled += ds;
        a += k * ds * (1.0 + travelled * 0.8);        // the spiral tightens as it slows
    }
    return best;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float curl = 1.5 + 3.5 * clamp(curlP, 0.0, 1.0);
    int nTracks = 8 + int(clamp(tracksP, 0.0, 1.0) * 8.0);
    float clock = sceneAdvance * 0.35 + sceneTime * 0.05;

    // The chamber: the photo dim and blue-green through the liquid.
    vec3 col = img(gl_FragCoord.xy / resolution) * mix(vec3(0.25), imgPalette(hue * 0.159 + 0.55) * 0.5, 0.5);
    col *= 0.7 + 0.3 * (1.0 - length(p) * 0.7);
    float onset = clamp(audioOnset, 0.0, 1.0);
    float dens = 0.5 + 0.5 * clamp(audioSwell, 0.0, 1.0);

    for (int i = 0; i < 16; ++i)
    {
        if (i >= nTracks) break;
        float fi = float(i);
        // Life: each track has its own period and phase; age 0..1.
        float period = 0.8 + 0.6 * hash11(fi * 3.1);
        float age = fract(clock / period + hash11(fi * 7.7));
        // Birth parameters: fixed for the life of this instance.
        float inst = floor(clock / period + hash11(fi * 7.7));
        float seed = fi * 13.0 + inst * 0.37;
        vec2 s = vec2((hash11(seed + 1.0) - 0.5) * 0.3, (hash11(seed + 2.0) - 0.5) * 0.3);   // near the vertex
        float a0 = hash11(seed + 3.0) * 6.2831853;
        float k = (hash11(seed + 4.0) - 0.5) * 2.0 * curl;
        float maxLen = 0.6 + 1.2 * hash11(seed + 5.0);
        float len = maxLen * smoothstep(0.0, 0.6, age);
        float fade = 1.0 - smoothstep(0.6, 1.0, age);
        float along;
        float d = trackDist(p, s, a0, k, len, along);
        // Bubbles: round beads along the track (V8e), density on the swell.
        float bead = 0.5 + 0.5 * cos(along * (120.0 * dens));
        float w = 0.004 + 0.004 * bead;
        float line = smoothstep(w, w * 0.3, d);
        vec3 tc = imgPalette(hue * 0.159 + fract(fi * 0.17));
        col += (tc * 0.7 + 0.5) * line * fade * (0.5 + 0.9 * onset);
        // A faint glow around the track head.
        vec2 headPos = s;   // the head glow is approximated at the birth vertex for cheapness
        col += tc * exp(-length(p - headPos) * 12.0) * 0.06 * fade;
    }
    // The interaction vertex: a bright point glowing with the bass.
    col += imgPalette(hue * 0.159 + 0.9) * exp(-length(p) * 10.0) * (0.3 + 1.0 * clamp(audioBass, 0.0, 1.0));
    // Chamber fiducial crosses.
    vec2 fc = abs(fract(p * 2.0 + 0.5) - 0.5);
    float cross = (smoothstep(0.004, 0.0, fc.x) * step(fc.y, 0.03) + smoothstep(0.004, 0.0, fc.y) * step(fc.x, 0.03));
    col += vec3(0.6) * cross * 0.35;
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
