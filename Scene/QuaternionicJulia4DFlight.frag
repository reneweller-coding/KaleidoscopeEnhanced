#version 330 core
out vec4 fragColor;
// QuaternionicJulia4DFlight.frag
// -----------------------------------------------------------------------
// QUATERNIONIC JULIA 4D FLIGHT: Raymarched flight through a true 4D
// Quaternion Julia fractal (q_{n+1} = q_n^2 + C). Projected into 3D via
// 4D hyper-rotations with metallic specular highlights, audio-reactive
// constant morphing, and continuous photo texture refraction.
//   audioAdvance -> rotates 4D hyper-plane slicing angles (xw, yw, zw)
//   audioKick    -> morphs quaternion constant C & triggers metallic flashes
//   audioBass    -> pulses 4D Julia escape radius and fractal density
//   audioSwell   -> increases specular glossiness and iridescence
//
// Per-activation variety:
//   iterP   float raymarching & fractal iteration depth (0.5..2.0)
//   sliceP  float 4D hyperspace slice offset            (0.5..2.2)
//   speedP  float 4D rotation velocity                 (0.5..2.0)
//   hueP    float metallic iridescence hue offset      (0..6.28)
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;
uniform float audioChromaHue;

uniform float iterP;
uniform float sliceP;
uniform float speedP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}


// IMG-PALETTE (house standard): colours come from a rotating arc in the
// CURRENT slideshow image, so every activation inherits a fresh palette from
// the photos; the arc follows the musical key (audioChromaHue is circular-
// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

mat2 rot2D(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

// 4D Quaternion Multiplication: q1 * q2
vec4 qMul(vec4 q1, vec4 q2) {
    return vec4(
        q1.x * q2.x - dot(q1.yzw, q2.yzw),
        q1.x * q2.yzw + q2.x * q1.yzw + cross(q1.yzw, q2.yzw)
    );
}

// Distance estimator for 4D Quaternion Julia set
float qJuliaSDF(vec4 p, vec4 c, out float trap) {
    vec4 q = p;
    vec4 qp = vec4(1.0, 0.0, 0.0, 0.0);
    trap = 1e5;

    for (int i = 0; i < 9; ++i) {
        qp = 2.0 * qMul(q, qp);
        q = qMul(q, q) + c;

        float r2 = dot(q, q);
        trap = min(trap, abs(q.x * q.y));
        if (r2 > 8.0) break;
    }

    float r = length(q);
    return 0.5 * r * log(r) / max(length(qp), 1e-4);
}

void main() {
    float itr = (iterP  > 0.0) ? iterP  : 1.0;
    float slc = (sliceP > 0.0) ? sliceP : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.3 * spd + audioAdvance * 0.15;

    // Raymarching setup
    vec3 ro = vec3(0.0, 0.0, -2.4);
    vec3 rd = normalize(vec3(uv, 1.2 - 0.25 * audioKick));

    rd.yz = rot2D(sin(t * 0.4) * 0.3) * rd.yz;
    rd.xz = rot2D(t * 0.5) * rd.xz;

    // 4D Quaternion constant C morphing
    // Morph kept INSIDE the filled-set regime: the old wide excursions
    // pushed C into dust territory where the Julia set is empty and the
    // frame went black (t=16 in the catalogue).
    vec4 C = vec4(
        -0.45 + 0.06 * sin(t * 0.7),
         0.40 + 0.05 * cos(t * 0.5),
        -0.18 + 0.05 * sin(t * 0.9),
        -0.08 + 0.05 * cos(t * 1.1) + audioKick * 0.06
    );

    // 4D Slice coordinate w
    float wCoord = sin(t * 0.6) * 0.4 * slc;

    float dO = 0.0;
    float hitDist = -1.0;
    float trapMin = 1e5;
    vec3 hitP;

    for (int i = 0; i < 48; ++i) {
        vec3 p = ro + rd * dO;
        vec4 p4D = vec4(p, wCoord);

        // Hyper-rotation in 4D (xw and yw planes)
        p4D.xw = rot2D(t * 0.4) * p4D.xw;
        p4D.yw = rot2D(t * 0.3) * p4D.yw;

        float curTrap;
        float dS = qJuliaSDF(p4D, C, curTrap);
        trapMin = min(trapMin, curTrap);

        if (dS < 0.003) {
            hitDist = dO;
            hitP = p;
            break;
        }
        if (dO > 6.0) break;
        dO += dS * 0.7;
    }

    // Miss rays carry trapMin too: an orbit-trap AURA fills the frame with
    // the fractal's energy field instead of near-black (the metric scan
    // measured luma 6 / coverage 0 -- the set is thin at many C morphs and
    // most rays miss).  Level breathes the aura, phase spins its colour.
    vec3 col = vec3(0.02, 0.02, 0.05);
    vec3 aura = imgPalette((trapMin * 8.0 + audioPhase) * 0.159)
                * exp(-trapMin * 1.4) * (0.9 + 0.4 * audioLevel);
    col += aura * 0.85;

    if (hitDist > 0.0) {
        // Normal approximation
        vec2 e = vec2(0.005, 0.0);
        float tUnused;
        vec4 hp = vec4(hitP, wCoord);
        vec3 n = normalize(vec3(
            qJuliaSDF(hp + e.xyyy, C, tUnused) - qJuliaSDF(hp - e.xyyy, C, tUnused),
            qJuliaSDF(hp + e.yxyy, C, tUnused) - qJuliaSDF(hp - e.yxyy, C, tUnused),
            qJuliaSDF(hp + e.yyxy, C, tUnused) - qJuliaSDF(hp - e.yyxy, C, tUnused)
        ));

        vec3 lightDir = normalize(vec3(0.6, 0.8, -0.5));
        float diff = max(dot(n, lightDir), 0.0);
        float spec = pow(max(dot(reflect(-lightDir, n), -rd), 0.0), 32.0);

        // Photo mapping from surface reflection and normal
        vec2 photoUV = fract(n.xy * 0.5 + 0.5 + hitP.z * 0.1);
        vec3 photo = img(photoUV);

        // Iridescent metallic gradient
        vec3 irid = imgPalette((trapMin * 12.0 + audioPhase) * 0.159);

        col = mix(photo * 0.9, irid, 0.5);
        col = col * (0.3 + 0.7 * diff) + spec * vec3(1.0, 0.95, 0.9) * (1.2 + audioKick * 2.0);

        // Depth fog
        col = mix(col, vec3(0.02, 0.02, 0.06), 1.0 - exp(-hitDist * 0.3));
    }

    if (audioChromaHue != 0.0)     if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, 1.0);
}
