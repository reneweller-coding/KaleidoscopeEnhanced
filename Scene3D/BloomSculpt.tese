#version 400 core
// BloomSculpt.tese — a sphere grown into a flower by the twelve chroma bins.
// -----------------------------------------------------------------------
// The patch sheet's (u,v) is read as (azimuth, polar angle), so the flat grid
// closes into a sphere.  Its radius is then modulated by twelve spherical
// harmonics, one per pitch class: a held C swells the two-lobed mode, a chord
// grows several lobes at once, and a melody makes the whole shape breathe
// through its overtones.
//
// Each mode carries the sin(phi)^m factor real spherical harmonics have.  That
// is not cosmetic — it is what makes the mode vanish at the poles, where the
// azimuth is undefined.  Without it every m>0 term meets itself at the pole
// with a different value for each incoming meridian, and the sphere pinches
// into a flickering spike.
//
// The tangent frame is differentiated analytically for the same reason as in
// Ocean: with the tessellation level varying across the surface, finite
// differences would alias along every level boundary.
// -----------------------------------------------------------------------
layout(quads, fractional_odd_spacing, ccw) in;

in  vec2 tcUV[];
in  vec4 tcSeed[];

out vec3  vObj;         // object-space point (drives the body colour)
out vec3  vNormal;
out vec3  vView;        // view direction at the surface
out float vSwell;       // total displacement, for the emissive seams
out vec2  vSurfUV;

uniform mat4  projM;
uniform float eyeOff;
uniform float audioAdvance;
uniform float audioChroma[12];
uniform float audioSubBass;
uniform float audioLevel;

uniform float bloomP;       // preset: how far the lobes reach
uniform float camDistP;     // preset: distance to the sculpture
uniform float twistP;       // preset: how fast the modes rotate

const float PI = 3.14159265;

// Twelve (k, m) pairs, one per pitch class: k sets how many rings run from
// pole to pole, m how many lobes run around the equator.  Low pitch classes
// get the big slow shapes, high ones the fine ruffles.
const float MODE_K[12] = float[12](1.0, 2.0, 2.0, 3.0, 3.0, 3.0,
                                   4.0, 4.0, 5.0, 5.0, 6.0, 6.0);
const float MODE_M[12] = float[12](0.0, 1.0, 2.0, 1.0, 2.0, 3.0,
                                   2.0, 3.0, 2.0, 4.0, 3.0, 5.0);
// Standing weight per mode, so the sculpture has a strong silhouette even in
// silence — the music then swells individual lobes on top of it.  Alternating
// signs make neighbouring modes carve INTO each other instead of piling up
// into one smooth bulge.
const float MODE_W[12] = float[12]( 0.34, -0.26,  0.30, -0.22,  0.25, -0.28,
                                    0.20, -0.17,  0.15, -0.19,  0.12, -0.14);

void main()
{
    vec2 uvA = mix(tcUV[0], tcUV[1], gl_TessCoord.x);
    vec2 uvB = mix(tcUV[3], tcUV[2], gl_TessCoord.x);
    vec2 uv  = mix(uvA, uvB, gl_TessCoord.y);

    float th  = uv.x * 2.0 * PI;        // azimuth, closes exactly at u=0/1
    float phi = uv.y * PI;              // polar angle, 0 = north pole

    float sp = sin(phi), cp = cos(phi);
    float st = sin(th),  ct = cos(th);

    vec3 eR   = vec3(sp * ct, cp, sp * st);
    vec3 eTh  = vec3(-st, 0.0, ct);                 // d(eR)/d(th) = sp * eTh
    vec3 ePhi = vec3(cp * ct, -sp, cp * st);        // d(eR)/d(phi)

    // The raw harmonic sum and its two partial derivatives.
    float S = 0.0, dSdTh = 0.0, dSdPhi = 0.0, swell = 0.0;

    for (int i = 0; i < 12; ++i)
    {
        float k = MODE_K[i];
        float m = MODE_M[i];

        // Bins are L1-normalised (~0..0.3), so x4 brings a strong pitch class
        // to about 1.  The higher modes are damped as well, or a bright cymbal
        // shreds the silhouette into noise.
        // Each mode also breathes on its own slow cycle, so the sculpture keeps
        // reshaping itself through a held chord instead of freezing.
        float lfo = 0.55 + 0.45 * sin(audioAdvance * (0.05 + 0.021 * float(i))
                                      + float(i) * 2.399);
        // Weighted UP with m, not down with k.  The petals — the whole reason
        // to build this on a sphere — are the high-m modes, and damping them
        // for safety leaves nothing but a smooth bulge.  The sin(phi)^m factor
        // already confines them to the equatorial band, which is what keeps
        // them from turning the poles into noise.
        float emph = 0.45 + 0.55 * m / 5.0;
        float amp = bloomP * emph * (MODE_W[i] * lfo
                                     + 0.75 * audioChroma[i] * 4.0 * sign(MODE_W[i]));

        float ph = audioAdvance * twistP * (0.05 + 0.012 * float(i));
        float ca = cos(m * th + ph), sa = sin(m * th + ph);
        float ck = cos(k * phi),     sk = sin(k * phi);

        // sin(phi)^m, and its derivative m*sin^(m-1)*cos — both written so the
        // m = 0 case stays exactly 1 and 0 without a pow(0,0).
        float sm  = (m < 0.5) ? 1.0 : pow(max(sp, 0.0), m);
        float smD = (m < 0.5) ? 0.0 : m * pow(max(sp, 1e-4), m - 1.0) * cp;

        S      += amp * sm * ca * ck;
        dSdTh  += -amp * m * sm * sa * ck;
        dSdPhi += amp * ca * (smD * ck - k * sm * sk);
        swell  += abs(amp * sm * ca * ck);
    }

    // Sharpening.  A sum of smooth harmonics is smooth, and rendering it
    // straight gives a bulging blob no matter how many modes go in.  Raising
    // it to a power below one pushes the mid values out toward the extremes,
    // so the surface spends its time on broad petals joined by tight creases
    // instead of drifting gently between them.  The exponent is applied to the
    // DERIVATIVES too (chain rule) — the normals have to follow the shape the
    // vertices actually take, or the creases light as if they were still round.
    const float SHARP = 0.68;
    float aS = max(abs(S), 0.035);        // the guard keeps the crease finite
    float shaped = sign(S) * pow(aS, SHARP);
    float dShape = SHARP * pow(aS, SHARP - 1.0);

    // Valleys cut 1.35x deeper than the ridges rise, which is what separates
    // the petals instead of leaving them merged at the base.
    float asym = (S < 0.0) ? 1.35 : 1.0;

    float r      = 1.0 + shaped * asym;
    float dRdTh  = dShape * dSdTh  * asym;
    float dRdPhi = dShape * dSdPhi * asym;

    // A slow overall breath so the sculpture still lives through quiet passages.
    float breath = 1.0 + 0.06 * sin(audioAdvance * 0.31) + 0.10 * audioSubBass;
    r *= breath;
    dRdTh *= breath;
    dRdPhi *= breath;

    // With twelve modes stacked, the valleys can reach through the origin and
    // the surface turns itself inside out.  Clamping the radius folds those
    // valleys into a flat floor instead — a crease, not a knot.
    if (r < 0.18) { r = 0.18; dRdTh = 0.0; dRdPhi = 0.0; }

    vec3 p = r * eR;

    // dp/dth = dRdTh * eR + r*sp * eTh ; dp/dphi = dRdPhi * eR + r * ePhi
    vec3 dpdTh  = dRdTh  * eR + r * sp * eTh;
    vec3 dpdPhi = dRdPhi * eR + r * ePhi;

    vec3 n = cross(dpdPhi, dpdTh);
    // At the poles dp/dth collapses to zero and the cross product with it is
    // meaningless; fall back to the radial direction there.
    n = (dot(n, n) < 1e-9) ? eR : normalize(n);
    if (dot(n, eR) < 0.0) n = -n;

    // Slow tumble, so the silhouette keeps presenting new lobes.
    float ya = audioAdvance * 0.11, pa = 0.35 * sin(audioAdvance * 0.07);
    mat3 yaw   = mat3(cos(ya), 0.0, -sin(ya), 0.0, 1.0, 0.0, sin(ya), 0.0, cos(ya));
    mat3 pitch = mat3(1.0, 0.0, 0.0, 0.0, cos(pa), sin(pa), 0.0, -sin(pa), cos(pa));
    mat3 rot = yaw * pitch;

    vec3 pw = rot * p;
    vec3 nw = rot * n;

    float dist = camDistP * (1.0 - 0.05 * audioLevel);
    vec3 vp = vec3(pw.x - eyeOff, pw.y, pw.z + dist);

    vObj    = p;
    vNormal = nw;
    vView   = normalize(-vec3(vp.x, vp.y, vp.z));
    vSwell  = swell;
    vSurfUV = uv;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
