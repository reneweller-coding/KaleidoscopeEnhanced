#version 330 core
out vec4 fragColor;
/**
 * @file AtmosphericGravityWaveUndularBore.frag
 * @brief ATMOSPHERIC GRAVITY WAVE UNDULAR BORE: 220x120 heightfield grid of mesospheric
 * undular bore gravity wave solitons. Emits emerald hydroxyl airglow emission lines,
 * atmospheric curvature depth, and photo texturing.
 *   audioAdvance -> drives mesospheric gravity wave soliton propagation
 *   audioKick    -> flashes wave crest chemiluminescent airglow surges
 *   audioSwell   -> thickens atmospheric airglow layer & wave amplitude
 *   audioCentroid-> shifts atomic oxygen & hydroxyl emission spectra
 *
 * Per-activation variety:
 *   boreWaveP float gravity wave soliton frequency          (6.0..18.0)
 *   airglowP  float mesospheric chemiluminescence luminance (0.8..2.5)
 */

in vec2 vUV;
in vec3 vNormal;
in vec3 vCol;
in float vAirglow;

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioSwell;

uniform float airglowP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

void main()
{
    vec3 lightDir = normalize(vec3(0.0, 0.6, 0.8));
    float diff = max(0.0, dot(vNormal, lightDir));
    
    vec3 photo = img(vUV);
    
    vec3 col = vCol * (0.5 + 0.5 * photo) * (0.6 + 0.4 * diff);
    col += vCol * vAirglow * (airglowP > 0.01 ? airglowP : 1.2) * 1.6;
    col += vec3(0.85, 1.0, 0.9) * vAirglow * 0.8;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
