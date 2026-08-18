#version 330 core
out vec4 fragColor;
// FxDopplerBeamingWipe.frag
// -----------------------------------------------------------------------
// FX DOPPLER BEAMING WIPE: Relativistic Doppler shift & headlamp effect.
// Approaching scene elements experience intense blue-shifting and relativistic
// beaming brightness amplification while receding elements red-shift away.
//   interpolation -> sweeps relativistic velocity beta = v/c across screen
//   audioKick     -> flashes relativistic Lorentz headlamp focus
//   audioBass     -> widens Doppler spectral frequency shift
//
// Per-activation variety:
//   dopplerP float Doppler spectral shift magnitude (0.5..2.2)
//   angleP   float relativistic boost angle         (0.5..2.0)
//   speedP   float animation speed multiplier       (0.5..2.0)
//   hueP     float Doppler chromatic hue offset     (0..6.28)
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

uniform float dopplerP;
uniform float angleP;
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
    float dpl = (dopplerP > 0.0) ? dopplerP : 1.0;
    float ang = (angleP   > 0.0) ? angleP   : 1.0;
    float spd = (speedP   > 0.0) ? speedP   : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.4 * spd + audioAdvance * 0.2;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Boost direction vector
    vec2 boostDir = normalize(vec2(cos(t * 0.3 * ang), sin(t * 0.3 * ang)));
    float proj = dot(p, boostDir);

    // Doppler factor delta = 1 / (gamma * (1 - beta * cos theta))
    float beta = mix(-0.8, 0.8, tProg) * dpl;
    float dopplerFactor = 1.0 + beta * proj * 1.5;

    // Relativistic aberration displacement
    vec2 aberrDisp = boostDir * beta * 0.05 * midTransition;

    vec4 c1 = texture(tex1, fract(uv + aberrDisp));
    vec4 c0 = texture(tex0, fract(uv - aberrDisp));

    // Doppler color shift: Blue shift (approaching) vs Red shift (receding)
    vec3 blueTint = vec3(0.3, 0.85, 1.2);
    vec3 redTint  = vec3(1.2, 0.4, 0.2);
    vec3 dopplerTint = (beta > 0.0) ? mix(vec3(1.0), blueTint, abs(beta) * midTransition)
                                    : mix(vec3(1.0), redTint,  abs(beta) * midTransition);

    vec4 col = mix(c1, c0, tProg);
    col.rgb *= dopplerTint;

    // Relativistic beaming headlamp beam
    float headlamp = exp(-abs(proj) * 15.0) * midTransition;
    col.rgb += headlamp * vec3(1.0, 0.95, 0.85) * (1.0 + audioKick * 3.0);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue);

    fragColor = col;
}
