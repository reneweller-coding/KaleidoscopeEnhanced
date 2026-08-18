#version 330 core
out vec4 fragColor;
/**
 * @file FxFaradayWaveLattice.frag
 * @brief FX FARADAY WAVE LATTICE: Parametric fluid surface Faraday wave transition.
 * Vertical oscillation of a fluid layer excites subharmonic standing wave lattices
 * (Faraday crispatio), whose undulating nodal grids cross-fade and morph between scenes.
 *   interpolation -> sweeps Faraday standing wave amplitude & lattice modes
 *   audioKick     -> flashes parametric resonance wave crest peaks
 *   audioBass     -> drives vertical fluid acceleration & wave height
 *
 * Per-activation variety:
 *   faradayP float Faraday wave frequency & wavenumber (0.5..2.2)
 *   gridP    float square vs hexagonal lattice mode    (0.5..2.0)
 *   speedP   float animation speed multiplier          (0.5..2.0)
 *   hueP     float fluid highlight hue offset          (0..6.28)
 */

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

uniform float faradayP;
uniform float gridP;
uniform float speedP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float fdy = (faradayP > 0.0) ? faradayP : 1.0;
    float grd = (gridP    > 0.0) ? gridP    : 1.0;
    float spd = (speedP   > 0.0) ? speedP   : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.5 * spd + audioAdvance * 0.25;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Parametric standing wave field: eta(x,y,t) = cos(kx)*cos(ky)*cos(omega*t)
    vec2 q = p * 20.0 * fdy;
    float modeX = cos(q.x) * cos(q.y * grd);
    float modeDiag = cos(0.707 * (q.x + q.y)) * cos(0.707 * (q.x - q.y));

    float faradayWave = mix(modeX, modeDiag, sin(t * 1.5) * 0.5 + 0.5) * cos(t * 6.0);

    // Fluid heightfield normal vector
    vec2 normalGrad = vec2(-sin(q.x) * cos(q.y), -cos(q.x) * sin(q.y)) * faradayWave;
    vec2 disp = normalGrad * 0.03 * midTransition * (1.0 + audioBass * 0.8);

    vec4 c1 = texture(tex1, fract(uv + disp));
    vec4 c0 = texture(tex0, fract(uv - disp));

    float blend = clamp(tProg + faradayWave * 0.3 * midTransition, 0.0, 1.0);
    vec4 col = mix(c1, c0, blend);

    // Standing wave crest specular glints
    float crestGlint = pow(max(0.0, faradayWave), 4.0) * midTransition;
    col.rgb += crestGlint * vec3(0.25, 0.9, 1.0) * (1.3 + audioKick * 3.0);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue);

    fragColor = col;
}
