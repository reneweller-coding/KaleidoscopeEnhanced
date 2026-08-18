#version 330 core
out vec4 fragColor;
// EscherRelativityMatrix.frag
// -----------------------------------------------------------------------
// PENROSE ENDLESS STAIRCASE: a real Escher, drawn as an isometric
// lithograph after "Ascending and Descending".  Four flights of steps
// (7-4-7-4) close into an impossible loop whose screen polygon closes
// EXACTLY — the two short flights secretly swallow the accumulated
// height while still showing ascending risers.  Glowing walkers climb
// the loop forever, driven by the music.
//   audioAdvance -> walkers march around the impossible loop
//   audioKick    -> the stone breathes, risers flash
//   audioLevel   -> walker glow brightness
//   audioFlux    -> walker halo shimmer
//
// Per-activation variety:
//   hueP     float palette base hue rotation               (0..6.28)
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

uniform float gridP;
uniform float archP;
uniform float neonP;
uniform float hueP;
uniform float audioChromaHue;

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

// =======================================================================
// PENROSE ENDLESS STAIRCASE — a real Escher.
// Drawn the way Escher drew it: a 2D lithograph whose screen polygon
// CLOSES EXACTLY.  Four flights (7-4-7-4 steps): the two long flights
// ascend honestly, the two short flights secretly swallow the whole
// accumulated height while still showing ascending riser faces — that IS
// the Penrose illusion, no seam and no hiding tower needed.
// Glowing walkers climb the loop forever, advancing with the music
// (audioAdvance is integrated host-side = jump-free); the stone breathes
// with the kick.
// =======================================================================

const int   N_LONG  = 7;      // steps in flights 0 and 2
const int   N_SHORT = 4;      // steps in flights 1 and 3
const int   N_TOTAL = 22;     // 2*(N_LONG + N_SHORT)
const float TX      = 0.068;  // iso tread x
const float TY      = 0.0408; // iso tread y (0.6 * TX, high viewpoint)
const float STEP_H  = 0.024;  // riser height (screen units)
const float COLUMN  = 0.075;  // short support skirt below each step

// Solve p = P + s*e1 + t*e2; returns (s,t).
vec2 invBilinear(vec2 p, vec2 P, vec2 e1, vec2 e2)
{
    float det = e1.x * e2.y - e1.y * e2.x;
    vec2  d   = p - P;
    return vec2(d.x * e2.y - d.y * e2.x, e1.x * d.y - e1.y * d.x) / det;
}
bool inQuad(vec2 st) { return st.x >= 0.0 && st.x <= 1.0 && st.y >= 0.0 && st.y <= 1.0; }

// Iso tread edge per flight (top-face advance direction).
vec2 flightTread(int f)
{
    if (f == 0) return vec2( TX,  TY);
    if (f == 1) return vec2(-TX,  TY);
    if (f == 2) return vec2(-TX, -TY);
    return          vec2( TX, -TY);
}
// Per-step anchor lift: long flights rise by STEP_H; the short flights
// carry the closure correction  STEP_H - N_TOTAL*STEP_H/(2*N_SHORT).
float flightLift(int f)
{
    float corr = STEP_H * (1.0 - float(N_TOTAL) / float(2 * N_SHORT));
    return (f == 0 || f == 2) ? STEP_H : corr;
}
// Depth edge of the tread (the other iso axis of the top rhombus).
vec2 flightD(int f)
{
    if (f == 0) return vec2(-0.044,  0.026);
    if (f == 1) return vec2(-0.044, -0.026);
    if (f == 2) return vec2( 0.044, -0.026);
    return          vec2( 0.044,  0.026);
}

void main() {
    float hue = (hueP > 0.0) ? hueP : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    // The print sways almost imperceptibly; the kick makes the stone breathe.
    float sway = 0.02 * sin(time * 0.15);
    uv = mat2(cos(sway), -sin(sway), sin(sway), cos(sway)) * uv;
    float breathe = 1.0 + 0.03 * audioKick;
    uv /= (1.05 * breathe);
    uv.y += 0.045;

    // --- paper + faint photo ghost, Escher's warm lithograph paper -------
    vec3 paper = vec3(0.84, 0.80, 0.72) * (0.72 + 0.28 * img(st).g);
    paper *= 1.0 - 0.06 * sin(gl_FragCoord.y * 1.4);        // litho hatching
    paper *= 1.0 - 0.35 * smoothstep(0.45, 1.1, length(uv));
    vec3 col = paper;

    vec2 upv = vec2(0.0, 1.0);

    // --- walk the loop once, collecting every step's anchor ---------------
    vec2 anch[N_TOTAL];
    int  fl  [N_TOTAL];
    {
        vec2 a = vec2(-0.10, -0.26);        // loop start (front corner, near)
        int  k = 0;
        for (int f = 0; f < 4; ++f) {
            int n = (f == 0 || f == 2) ? N_LONG : N_SHORT;
            vec2 adv = (flightTread(f) + vec2(0.0, flightLift(f))) * breathe;
            for (int i = 0; i < N_LONG; ++i) {
                if (i >= n) break;
                anch[k] = a;  fl[k] = f;  a += adv;  ++k;
            }
        }
    }

    // --- painter's algorithm: highest anchors first (far), lowest last ----
    float ykey[N_TOTAL];
    for (int j = 0; j < N_TOTAL; ++j) ykey[j] = anch[j].y;
    int hitStep = -1;
    for (int o = 0; o < N_TOTAL; ++o) {
        int   k  = 0;
        float by = -1e9;
        for (int j = 0; j < N_TOTAL; ++j)
            if (ykey[j] > by) { by = ykey[j]; k = j; }
        ykey[k] = -2e9;                     // consumed

        int  f = fl[k];
        vec2 Q = anch[k];
        // ACTUAL anchor advance (tread + lift): using it for the top face is
        // what makes consecutive treads connect without gaps.
        vec2 adv = (flightTread(f) + vec2(0.0, flightLift(f))) * breathe;
        vec2 D  = flightD(f) * breathe;
        float hs = STEP_H * breathe;
        // Top-face advance: riser top -> NEXT anchor.  Honest iso tread on
        // the long flights, subtly sheared on the short ones — Penrose's
        // hidden cheat lives exactly here.
        vec2 topAdv = adv - upv * hs;

        // The walkway flank facing the viewer: OUTER edge (at Q) for the two
        // near flights, INNER edge (at Q+D) for the two far flights.  Each
        // step's flank sits at its own height -> stepped silhouette.
        vec2 flankO = (f == 0 || f == 3) ? vec2(0.0) : D;
        vec2 stq = invBilinear(uv, Q + flankO - vec2(0.0, COLUMN), topAdv,
                               vec2(0.0, COLUMN + hs));
        if (inQuad(stq)) {
            col = paper * (0.34 - 0.10 * stq.y) + vec3(0.02);
            hitStep = k;
        }

        // skirt front under the riser (spans the walkway depth)
        stq = invBilinear(uv, Q - vec2(0.0, COLUMN), D, vec2(0.0, COLUMN));
        if (inQuad(stq)) { col = paper * 0.24 + vec3(0.015); hitStep = k; }

        // riser: spans walkway DEPTH x height at the leading edge — the
        // ascent cue on every flight (v4 wrongly ran it along the advance).
        stq = invBilinear(uv, Q, D, upv * hs);
        if (inQuad(stq)) { col = paper * (0.55 + 0.12 * audioKick); hitStep = k; }

        // tread (top face) — the bright rhombus, meets the next riser exactly
        stq = invBilinear(uv, Q + upv * hs, topAdv, D);
        if (inQuad(stq)) {
            col = paper * (0.95 - 0.06 * stq.y);
            hitStep = k;
        }
    }

    // --- walkers: glowing figures climbing the loop forever --------------
    float march = time * 0.35 + audioAdvance * 1.6;     // steps per unit
    for (int w = 0; w < 3; ++w) {
        float fi = fract((march + float(w) * float(N_TOTAL) / 3.0) / float(N_TOTAL));
        float fk = fi * float(N_TOTAL);
        int   k  = int(fk);
        vec2  Q  = anch[k];
        vec2  T  = (flightTread(fl[k]) + vec2(0.0, flightLift(fl[k]))) * breathe;
        vec2  D  = flightD(fl[k]) * breathe;
        // stand mid-tread, hop within the step
        float hop = abs(sin(fract(fk) * 3.14159)) * 0.012;
        vec2 wp = Q + (T - upv * STEP_H * breathe) * 0.45 + D * 0.5
                + upv * (STEP_H * breathe + 0.016 + hop);
        float d = length(uv - wp);
        vec3 wcol = imgPalette(float(w) * 0.33) * 1.6;
        col += wcol * exp(-d * d * 2600.0) * (0.9 + 0.9 * audioLevel);
        col += wcol * exp(-d * 42.0) * 0.12 * (0.6 + 0.8 * audioFlux);
    }

    // House tint: the lithograph leans gently toward the photo's mood.
    vec3 pal = imgPalette(0.25);
    float lum = dot(col, vec3(0.333));
    col = mix(col, pal * (lum / max(dot(pal, vec3(0.333)), 1e-3)), 0.12);

    if (hue > 0.001) col = hueRot(col, hue);
    col /= 1.0 + 0.25 * max(col.r, max(col.g, col.b));
    fragColor = vec4(col, 1.0);
}
