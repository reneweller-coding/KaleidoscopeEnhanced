#version 330 core
out vec4 fragColor;
// FxLiquidCrystalDefectDomain.frag
// -----------------------------------------------------------------------
// FX LIQUID CRYSTAL DEFECT DOMAIN: Nematic liquid crystal Schlieren transition.
// Topological point defects (disclinations with strength s = +/-1/2), rainbow
// birefringence interference tints on the domains between them, and dark
// extinction brushes rotate and annihilate as the director field aligns,
// seamlessly transitioning into the incoming scene.
//   interpolation -> sweeps director field alignment & defect annihilation
//   audioKick     -> flashes topological disclination core singularities
//   audioBass     -> drives director field Frank elastic distortion
//
// Per-activation variety:
//   defectP float topological defect density & core scale (0.5..2.2)
//   brushP  float cross-polarizer Schlieren brush width   (0.5..2.0)
//   speedP  float animation speed multiplier              (0.5..2.0)
//   hueP    float nematic birefringence hue offset        (0..6.28)
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

uniform float defectP;
uniform float brushP;
uniform float speedP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

mat2 rot2D(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

void main() {
    float dfc = (defectP > 0.0) ? defectP : 1.0;
    float brs = (brushP  > 0.0) ? brushP  : 1.0;
    float spd = (speedP  > 0.0) ? speedP  : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.45 * spd + audioAdvance * 0.22;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Topological defect points (+1/2 defect at d1, -1/2 defect at d2)
    float defectDist = mix(0.3, 0.02, tProg) * dfc; // Defects annihilate as tProg -> 1
    vec2 d1 = vec2(-defectDist, 0.0);
    vec2 d2 = vec2( defectDist, 0.0);

    float theta1 = atan(p.y - d1.y, p.x - d1.x);
    float theta2 = atan(p.y - d2.y, p.x - d2.x);

    // Director angle: phi = 0.5 * theta1 - 0.5 * theta2
    float directorAngle = 0.5 * theta1 - 0.5 * theta2 + tProg * 3.14159265;

    // Cross-polarizer extinction brushes: I ~ sin^2(2*phi).
    // Square BEFORE pow: pow() with a negative base is undefined in GLSL
    // and produced NaNs that rendered half the frame solid black.
    float s2phi = sin(2.0 * directorAngle);
    float schlierenBrush = pow(s2phi * s2phi, brs);

    // Director field coordinate distortion
    vec2 directorDisp = vec2(cos(directorAngle), sin(directorAngle)) * 0.03 * midTransition * (1.0 + audioBass * 0.7);

    vec4 c1 = texture(tex1, fract(uv + directorDisp));
    vec4 c0 = texture(tex0, fract(uv - directorDisp));

    vec4 col = mix(c1, c0, tProg);

    // Birefringence interference colours: between crossed polarizers each
    // director orientation retards the light differently, so the domains
    // around the defects take on rotating rainbow interference tints --
    // THE signature look of a nematic Schlieren texture.
    vec3 biref = 0.5 + 0.5 * cos(4.0 * directorAngle + tProg * 3.14159265
                                 + vec3(0.0, 2.094, 4.189));
    col.rgb *= mix(vec3(1.0), biref, 0.45 * midTransition);

    // Extinction brushes overlay (dark crossed brushes between the domains)
    col.rgb *= mix(1.0, 0.3 + 0.7 * schlierenBrush, midTransition);

    // Defect core singularity glow -- small and local; the old 1.5+kick*3
    // gain turned both cores into giant white blobs.
    float coreGlow = (exp(-length(p - d1) * 30.0) + exp(-length(p - d2) * 30.0)) * midTransition;
    col.rgb += coreGlow * vec3(1.0, 0.85, 0.4) * (0.25 + audioKick * 0.3);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue);

    fragColor = col;
}
