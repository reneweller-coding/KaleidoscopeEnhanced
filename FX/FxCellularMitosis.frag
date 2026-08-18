#version 330 core
out vec4 fragColor;
// CombineCellularMitosis.frag
// -----------------------------------------------------------------------
// COMBINE CELLULAR MITOSIS: Biological cell division & cytokinesis transition.
// A parent biological cell elongates, forms a pinching cleavage furrow, and
// divides into daughter cells that separate and morph into the incoming scene.
//   interpolation -> controls cell elongation, cleavage furrow & cytokinesis
//   audioKick     -> flashes mitotic spindle fiber glowing microtubules
//   audioBass     -> undulates cell membrane elasticity & expansion
//
// Per-activation variety:
//   mitosisP float cell membrane curvature & size     (0.5..2.2)
//   cleaveP  float cytokinesis cleavage furrow depth (0.5..2.0)
//   speedP   float animation speed multiplier        (0.5..2.0)
//   hueP     float membrane glow hue offset          (0..6.28)
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

uniform float mitosisP;
uniform float cleaveP;
uniform float speedP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float mts = (mitosisP > 0.0) ? mitosisP : 1.0;
    float clv = (cleaveP  > 0.0) ? cleaveP  : 1.0;
    float spd = (speedP   > 0.0) ? speedP   : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.4 * spd + audioAdvance * 0.2;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Cleavage furrow: distance to dual daughter cell centers
    float sep = mix(0.0, 0.5, tProg) * mts;
    vec2 cLeft  = vec2(-sep, 0.0);
    vec2 cRight = vec2( sep, 0.0);

    float d1 = length(p - cLeft);
    float d2 = length(p - cRight);

    // Metaball fusion of two cell membranes: 1/d1^2 + 1/d2^2 = threshold
    float meta = (0.12 / max(d1 * d1, 0.001)) + (0.12 / max(d2 * d2, 0.001));
    float cellIso = smoothstep(1.0 - 0.2 * clv, 1.0 + 0.2 * clv, meta);

    // Membrane pinch displacement
    vec2 pinchDisp = normalize(p + 1e-4) * (1.0 - cellIso) * 0.04 * midTransition;

    vec4 c1 = texture(tex1, fract(uv + pinchDisp));
    vec4 c0 = texture(tex0, fract(uv - pinchDisp));

    vec4 col = mix(c1, c0, tProg);

    // Glowing lipid bilayer cell membrane
    float membrane = exp(-abs(meta - 1.0) * 8.0) * midTransition;
    col.rgb += membrane * vec3(0.2, 0.9, 0.6) * (1.5 + audioKick * 3.0);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue);

    fragColor = col;
}
