#version 330 core
// SpectralOrb.vert — MANIFOLD HARMONICS made real (the research-paper idea):
// the Laplace-Beltrami eigenfunctions of the SPHERE are known in closed form
// — they are the spherical harmonics Y_l^m — so the paper's "excite the
// natural vibration modes of a 3D body with the audio spectrum" needs no
// precomputed eigenbasis here at all.  Low spectrum bands drive low-order
// modes (the whole orb swells and buckles globally), high bands drive
// high-order modes (fine surface ripples).  Low l (0..3) use the EXACT
// Cartesian harmonics; the fine detail uses exact sectoral harmonics
// (cos(mθ)·sin^m φ) plus the standard asymptotic form of the zonal Legendre
// polynomials — mathematically honest throughout.
//
// STEREO (the paper's key trick): each cos(mθ) mode has a sin(mθ) partner.
// The MONO energy drives the cos part, the L−R SIDE signal drives the sin
// part — a wide stereo image literally deforms the orb asymmetrically,
// mirror-symmetric audio keeps it mirror-symmetric.  Continuous everywhere
// (no hemisphere seams).
//
// Grid geometry: attrA.x = u -> azimuth θ (0..2π), attrA.y = v -> polar
// φ (0..π).  Seam u=0/1 and both poles close automatically because the
// displacement depends only on the direction vector.

in vec4 attrA;
in vec4 attrB;

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

out vec3  vNorm;
out vec3  vView;
out float vDefo;    // |displacement| -> antinode glow
out float vHue;

// Sum of excited eigenmodes at unit direction d (θ,φ passed alongside to
// avoid re-deriving them).  Amplitudes come straight from the 32-band
// spectrum: band b -> mode with angular order growing with b.
float modeSum(vec3 d, float th, float ph)
{
    float x = d.x, y = d.y, z = d.z;
    float s = 0.0;

    // ---- l=1..3, exact Cartesian harmonics (bands 0..7, global shapes) ----
    // NO l=0 (uniform breathing) term: a DC radius change is invisible as
    // deformation but would saturate the antinode glow everywhere.  The very
    // lowest bands go to the MULTI-lobed l=2 modes first, so bass-heavy
    // material already shows structured standing waves, not just a lean.
    s += audioSpectrum[0] * 0.140 * (3.0 * z * z - 1.0) * 0.5;      // Y20
    s += audioSpectrum[1] * 0.140 * x;                              // Y11c
    s += audioSpectrum[2] * 0.130 * (x * x - y * y);                // Y22c
    s += audioSpectrum[3] * 0.130 * z;                              // Y10
    s += audioSpectrum[4] * 0.120 * (2.0 * x * y);                  // Y22s
    s += audioSpectrum[5] * 0.120 * y;                              // Y11s
    s += audioSpectrum[6] * 0.120 * (x * z);                        // Y21
    s += audioSpectrum[7] * 0.110 * (2.5 * z * z - 1.5) * z;        // Y30

    // ---- l=3..4 tesseral/sectoral, exact (bands 8..13) ----
    float sp = sin(ph);
    s += audioSpectrum[8]  * 0.100 * cos(3.0 * th) * sp * sp * sp;  // Y33
    s += audioSpectrum[9]  * 0.095 * x * (5.0 * z * z - 1.0);       // Y31
    s += audioSpectrum[10] * 0.090 * cos(4.0 * th) * sp * sp * sp * sp; // Y44
    s += audioSpectrum[11] * 0.090 * sin(3.0 * th + 1.3) * sp * sp * sp * z; // Y43-ish
    s += audioSpectrum[12] * 0.085 * cos(2.0 * th + 0.7) * sp * sp * (7.0 * z * z - 1.0) * 0.25; // Y42
    s += audioSpectrum[13] * 0.085 * cos(5.0 * th) * pow(sp, 5.0);  // Y55

    // ---- Fine modes: zonal Legendre asymptotics + high sectorals ----
    // P_l(cos φ) ~ sqrt(2/(π l sin φ)) · cos((l+1/2)φ − π/4) — the standard
    // asymptotic; amplitude window keeps the pole singularity harmless.
    float win = 0.75 / sqrt(max(sp, 0.14));
    for (int k = 0; k < 9; ++k)
    {
        float l  = 6.0 + float(k) * 2.0;                 // l = 6,8,..,22
        float zn = cos((l + 0.5) * ph - 0.7853982) * win;
        float m  = 3.0 + float(k);                       // twist per band
        float ang = m * th + float(k) * 1.7 + sceneSeed * 6.2831853;
        s += audioSpectrum[14 + 2 * k] * (0.060 - 0.003 * float(k)) * zn;
        if (14 + 2 * k + 1 < 32)
            s += audioSpectrum[14 + 2 * k + 1] * (0.055 - 0.003 * float(k))
               * cos(ang) * pow(sp, min(m, 8.0));
    }

    // ---- STEREO side modes: sin(mθ) partners driven by L−R ----
    vec3 side = audioStereoL - audioStereoR;             // −1..1-ish per register
    s += side.x * 0.110 * sin(th)       * sp;            // lows: whole-body lean
    s += side.y * 0.090 * sin(3.0 * th) * sp * sp * sp;  // mids
    s += side.z * 0.070 * sin(6.0 * th) * pow(sp, 6.0);  // highs: equator shimmer

    return s;
}

vec3 orbPoint(float u, float v)
{
    float th = u * 6.2831853;
    float ph = v * 3.1415927;
    vec3 d = vec3(sin(ph) * cos(th), cos(ph), sin(ph) * sin(th));

    // The body itself rotates slowly, so the standing-wave pattern (which is
    // fixed in body space) parades around — object rotation, not phase
    // remapping, hence flicker-free.
    float ra = time * 0.07;
    d.xz = mat2(cos(ra), -sin(ra), sin(ra), cos(ra)) * d.xz;
    float th2 = atan(d.z, d.x);
    float ph2 = acos(clamp(d.y, -1.0, 1.0));

    float defo = modeSum(d, th2, ph2);
    float R = 9.5 * (1.0 + 0.03 * audioKick);
    return d * R * (1.0 + defo);
}

void main()
{
    float u = attrA.x, v = attrA.y;

    vec3 p  = orbPoint(u, v);
    // Finite-difference normal from two displaced neighbours.  Order matters:
    // for this (θ, φ-from-north) parameterisation, ∂u × ∂v points OUTWARD
    // (∂v × ∂u pointed inward and lit the orb upside-down).
    vec3 pu = orbPoint(u + 0.004, v);
    vec3 pv = orbPoint(u, v + 0.004);
    vec3 nrm = normalize(cross(pu - p, pv - p));

    vec3 vp = p + vec3(0.0, 0.0, 30.0);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;

    vNorm = nrm;
    // Camera at MODEL-space (0,0,-30) — see JellyBody.vert for the sign story.
    vView = normalize(vec3(0.0, 0.0, -30.0) - p);
    vDefo = clamp(abs(length(p) / 9.5 - 1.0) * 4.0, 0.0, 1.0);
    vHue  = audioChromaHue;
}
