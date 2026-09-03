#version 400 core
/**
 * @file SpectroCanyon.tese
 * @brief Tessellation-evaluation stage companion to SpectroCanyon.frag -- see that file's header for
 * this scene's description.
 */
// SpectroCanyon.tese — a landscape whose terrain IS the music's history.
// -----------------------------------------------------------------------
// texSpectro holds a scrolling spectrogram: 32 log-spaced bands across, ~20 s
// of history down, written as a ring.  The canyon reads it as a heightfield —
// distance from the camera is time, distance from the canyon's centre line is
// frequency.  The mapping is mirrored so the BASS ends up in the two outer
// walls and the treble along the floor, which puts the loudest, slowest-moving
// part of the spectrum where it can tower over the flight path.
//
// The terrain mesh never moves.  The spectrogram slides through it, because
// spectroHead advances continuously, and that sliding is what the eye reads as
// flying forward.
// -----------------------------------------------------------------------
layout(quads, fractional_odd_spacing, ccw) in;

in  vec2 tcUV[];
in  vec4 tcSeed[];

out vec3  vWorld;
out vec3  vNormal;
out float vEnergy;      // spectrogram value at this point
out float vFreq;        // 0 = bass (outer wall), 1 = treble (floor)
out float vDist;

uniform mat4  projM;
uniform float eyeOff;
uniform float audioAdvance;
uniform float audioSwell;   // slow envelope, the calm replacement for the fast one (V7d)
uniform float audioSubBass;
uniform float audioLevel;

uniform sampler2D texSpectro;
uniform float spectroHead;      // T coordinate of "now", continuous
uniform float spectroFill;

uniform float camHP;        // preset: eye height above the floor
uniform float time;
uniform float heightP;      // preset: how tall the music builds
uniform float wallP;        // preset: the canyon's own V profile

// Must match SpectroCanyon.tesc exactly, or the two stages place the same
// patch in different spots and the walls tear along every seam.
const vec2 EXTENT = vec2(78.0, 260.0);

// How much of the ring the canyon's depth spans.  Below 1 so the far end never
// wraps into the newest row.
const float AGE_SPAN = 0.86;

float terrain(vec2 uv, out float energy, out float freq)
{
    // Mirror across the centre line: 0 at the edges (lowest band), 1 in the
    // middle (highest band).
    freq = 1.0 - abs(uv.x - 0.5) * 2.0;

    float t = spectroHead - uv.y * AGE_SPAN;
    energy = texture(texSpectro, vec2(freq, fract(t))).r;

    // Fade the very oldest rows out, and fade in while the ring is still
    // filling, so a fresh start rises out of a flat plain instead of showing a
    // wall of zeroes.
    energy *= smoothstep(0.0, 0.12, spectroFill);

    // FALLBACK: with an empty spectrogram ring (probe render, fresh start)
    // synthesize a plausible sliding spectrum so the canyon is never a bare
    // V-groove — and the slide keeps the flight illusion alive.
    if (spectroFill < 0.05)
    {
        float tt = time * 0.10 - uv.y * AGE_SPAN;
        float n1 = sin(freq * 21.0 + tt * 40.0) * 0.5 + 0.5;
        float n2 = sin(freq *  9.0 - tt * 23.0 + 1.7) * 0.5 + 0.5;
        energy = pow(n1 * 0.55 + n2 * 0.45, 2.0) * (0.85 - 0.35 * freq);
    }

    // The canyon's own V, so there are walls even in silence.
    float v = abs(uv.x - 0.5) * 2.0;
    float base = wallP * v * v * v;

    // The vertical scale is deliberately large against the canyon's width: at a
    // realistic aspect the walls sit below the horizon and the top half of the
    // frame is empty sky.  Overdriven, they close in overhead and the flight
    // reads as a gorge rather than as a valley.
    return (base + energy * heightP * (0.35 + 0.65 * v)) * 30.0;
}

void main()
{
    vec2 uvA = mix(tcUV[0], tcUV[1], gl_TessCoord.x);
    vec2 uvB = mix(tcUV[3], tcUV[2], gl_TessCoord.x);
    vec2 uv  = mix(uvA, uvB, gl_TessCoord.y);

    float energy, freq;
    float h = terrain(uv, energy, freq);

    vec3 p = vec3((uv.x - 0.5) * EXTENT.x, h, uv.y * EXTENT.y + 2.0);

    // Normals by central differences.  The height comes out of a texture, so
    // there is nothing to differentiate analytically — but the step is a fixed
    // WORLD distance, not a fixed fraction of a patch, so it does not change
    // with the tessellation level and the shading stays smooth across every
    // level boundary.
    const float EPS = 0.9;
    vec2 duv = vec2(EPS / EXTENT.x, EPS / EXTENT.y);
    float e0, f0;
    float hx1 = terrain(uv + vec2(duv.x, 0.0), e0, f0);
    float hx0 = terrain(uv - vec2(duv.x, 0.0), e0, f0);
    float hz1 = terrain(uv + vec2(0.0, duv.y), e0, f0);
    float hz0 = terrain(uv - vec2(0.0, duv.y), e0, f0);
    vec3 n = normalize(vec3(hx0 - hx1, 2.0 * EPS, hz0 - hz1));

    vWorld  = p;
    vNormal = n;
    vEnergy = energy;
    vFreq   = freq;
    vDist   = p.z;

    // A gentle sway, so the flight is not a rail.
    float sway = 5.0 * sin(audioAdvance * 0.08) * (0.6 + 0.4 * audioSwell);
    vec3 vp = vec3(p.x - sway - eyeOff,
                   p.y - camHP - 2.0 * audioSubBass,
                   p.z);
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
