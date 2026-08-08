#version 120
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

attribute vec4 attrA;
attribute vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform float sceneSeed;

uniform float audioSpectrum[32];
uniform vec3  audioStereoL;
uniform vec3  audioStereoR;
uniform float audioChromaHue;
uniform float audioKick;
uniform float audioSwell;
uniform float audioDrop;

varying vec3  vNorm;
varying vec3  vView;
varying float vDefo;
varying float vHue;

// (n,m) mode table: band k excites cos(2π(n·u + m·v)).  Low bands = low
// wavenumbers (global bending), high bands = fine tube ripples.
float modeSum(float u, float v)
{
    float TU = 6.2831853;
    float s = 0.0;
    float ph = sceneSeed * 6.2831853;

    // Global shapes (bands 0..7).  NO (0,0) DC term — uniform tube swelling
    // is invisible as deformation but would saturate the antinode glow.
    s += audioSpectrum[0] * 0.140 * cos(TU * (1.0 * u          ) + ph);
    s += audioSpectrum[1] * 0.130 * cos(TU * (           1.0 * v));
    s += audioSpectrum[2] * 0.125 * cos(TU * (2.0 * u          ) + ph * 1.7);
    s += audioSpectrum[3] * 0.120 * cos(TU * (1.0 * u + 1.0 * v) + ph);
    s += audioSpectrum[4] * 0.115 * cos(TU * (2.0 * u + 1.0 * v));
    s += audioSpectrum[5] * 0.110 * cos(TU * (3.0 * u          ) + ph * 2.3);
    s += audioSpectrum[6] * 0.105 * cos(TU * (           2.0 * v));
    s += audioSpectrum[7] * 0.100 * cos(TU * (3.0 * u + 2.0 * v) + ph);

    // Mid + fine modes (bands 8..31): wavenumbers climb with the band.
    for (int k = 0; k < 24; ++k)
    {
        float fk = float(k);
        float n  = 2.0 + floor(fk * 0.45);            // 2..12 around the ring
        float m  = 1.0 + floor(fk * 0.28);            // 1..7 around the tube
        float w  = 0.075 - fk * 0.0022;               // fine modes displace less
        s += audioSpectrum[8 + k] * w
           * cos(TU * (n * u + m * v) + ph + fk * 1.9);
    }

    // Stereo side modes (sin partners around the major circle).
    vec3 side = audioStereoL - audioStereoR;
    s += side.x * 0.100 * sin(TU * 1.0 * u);
    s += side.y * 0.080 * sin(TU * (3.0 * u + 1.0 * v));
    s += side.z * 0.060 * sin(TU * (6.0 * u + 2.0 * v));

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
    vec3 p = base + nrm * (r * defo);

    // Slow tumble (object rotation — pattern rides the body, no remapping).
    float a1 = time * 0.06;
    float a2 = 0.55 + 0.15 * sin(time * 0.031);
    p.yz = mat2(cos(a2), -sin(a2), sin(a2), cos(a2)) * p.yz;
    p.xz = mat2(cos(a1), -sin(a1), sin(a1), cos(a1)) * p.xz;
    return p;
}

void main()
{
    float u = attrA.x, v = attrA.y;

    vec3 p  = torusPoint(u, v);
    vec3 pu = torusPoint(u + 0.003, v);
    vec3 pv = torusPoint(u, v + 0.006);
    vec3 nrm = normalize(cross(pv - p, pu - p));

    vec3 vp = p + vec3(0.0, 0.0, 33.0);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;

    vNorm = nrm;
    vView = normalize(vec3(0.0, 0.0, 33.0) - p);
    // Deformation magnitude for the antinode glow (radius change vs. rest).
    vDefo = clamp(abs(modeSum(u, v)) * 4.0, 0.0, 1.0);
    vHue  = audioChromaHue;
}
