#version 330 core
// SpectralTorus.vert — the second manifold-harmonics body: on the (flat)
// torus the Laplace-Beltrami eigenfunctions are EXACTLY the 2D Fourier
// modes cos(2π(n·u + m·v)) — closed form, zero precomputation, and their
// periodicity closes the grid's u/v seams automatically.  Each spectrum
// band excites one (n,m) mode: low bands bend and squash the whole ring,
// high bands ripple the tube surface.  (For the embedded donut the flat
// metric is an approximation — visually indistinguishable, mathematically
// the standard choice.)
//
// STEREO: like SpectralOrb, every cos mode has a sin partner around the
// major circle; the mono energy drives cos, the L−R side signal drives sin
// — stereo width becomes a visible left/right asymmetry of the ring.
//
// Grid geometry: attrA.x = u -> major angle (around the ring),
// attrA.y = v -> minor angle (around the tube).

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform float audioAdvance;
uniform float sceneSeed;

uniform float audioSpectrum[32];
uniform vec3  audioStereoL;
uniform vec3  audioStereoR;
uniform float audioChromaHue;
uniform float audioKick;
uniform float audioSwell;
uniform float audioDrop;
uniform float audioBeatPhase;

out vec3  vNorm;
out vec3  vView;
out float vDefo;
out float vHue;

// (n,m) mode table: band k excites cos(2π(n·u + m·v)).  Low bands = low
// wavenumbers (global bending), high bands = fine tube ripples.
float modeSum(float u, float v)
{
    float TU = 6.2831853;
    float s = 0.0;
    float ph = sceneSeed * 6.2831853;

    // BIG, SLOW, CREATURELY: only the lowest few modes, with LARGE
    // amplitudes — the ring visibly bends, squashes and bulges like a
    // living body instead of trembling with fine ripples.  (The spectrum
    // is meter-smoothed host-side; the fine-mode chorus of the first
    // version read as nervous jitter.)
    s += audioSpectrum[1] * 0.25 * cos(TU * (1.0 * u          ) + ph);
    s += audioSpectrum[3] * 0.22 * cos(TU * (2.0 * u          ) + ph * 1.7);
    s += audioSpectrum[6] * 0.19 * cos(TU * (1.0 * u + 1.0 * v) + ph);
    s += audioSpectrum[10] * 0.16 * cos(TU * (3.0 * u          ) + ph * 2.3);
    s += audioSpectrum[16] * 0.14 * cos(TU * (2.0 * u + 1.0 * v));
    s += audioSpectrum[24] * 0.12 * cos(TU * (           1.0 * v) + ph);

    // Stereo side modes (sin partners around the major circle).
    vec3 side = audioStereoL - audioStereoR;
    s += side.x * 0.20 * sin(TU * 1.0 * u);
    s += side.y * 0.14 * sin(TU * (2.0 * u + 1.0 * v));

    return s;
}

vec3 torusPoint(float u, float v)
{
    float TU = 6.2831853;
    float Th = u * TU;                     // major angle
    float ph = v * TU;                     // minor angle

    float R = 10.0;
    float r = 4.0 * (1.0 + 0.03 * audioKick);

    vec3 ring   = vec3(cos(Th), 0.0, sin(Th));
    vec3 nrm    = ring * cos(ph) + vec3(0.0, 1.0, 0.0) * sin(ph);  // tube normal
    vec3 base   = ring * R + nrm * r;

    float defo = modeSum(u, v);
    // KICK WAVE: a fat bulge races once around the ring on every beat —
    // the clearest possible "the music runs through this body" signal.
    float wavePos = fract(u - audioBeatPhase);
    defo += 0.35 * audioKick * exp(-wavePos * 9.0);
    // A drop TWISTS the tube: v-offset shear that unwinds as it decays.
    vec3 p = base + nrm * (r * defo);

    // Faster tumble so the 3D body reads clearly.
    float a1 = time * 0.11;
    float a2 = 0.55 + 0.30 * sin(time * 0.047);
    p.yz = mat2(cos(a2), -sin(a2), sin(a2), cos(a2)) * p.yz;
    p.xz = mat2(cos(a1), -sin(a1), sin(a1), cos(a1)) * p.xz;
    return p;
}


// 3-AXIS TUMBLE (user feedback): slow rolls around x and z on top of the
// body's own y-spin, so the pattern is seen from ever-new angles.
vec3 tumble(vec3 q)
{
    float tx = time * 0.19 + audioAdvance * 0.05;
    float tz = time * 0.13;
    q.yz = mat2(cos(tx), -sin(tx), sin(tx), cos(tx)) * q.yz;
    q.xy = mat2(cos(tz), -sin(tz), sin(tz), cos(tz)) * q.xy;
    return q;
}

void main()
{
    float u = attrA.x, v = attrA.y;

    vec3 p  = torusPoint(u, v);
    vec3 pu = torusPoint(u + 0.003, v);
    vec3 pv = torusPoint(u, v + 0.006);
    vec3 nrm = normalize(cross(pv - p, pu - p));
    p   = tumble(p);
    nrm = tumble(nrm);

    vec3 vp = p + vec3(0.0, 0.0, 33.0);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;

    vNorm = nrm;
    // Camera at MODEL-space (0,0,-33) — see JellyBody.vert for the sign story.
    vView = normalize(vec3(0.0, 0.0, -33.0) - p);
    // Deformation magnitude for the antinode glow (radius change vs. rest).
    vDefo = clamp(abs(modeSum(u, v)) * 4.0, 0.0, 1.0);
    vHue  = audioChromaHue;
}
