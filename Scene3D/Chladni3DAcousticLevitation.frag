#version 330 core
out vec4 fragColor;
/**
 * @file Chladni3DAcousticLevitation.frag
 * @brief CHLADNI 3D ACOUSTIC LEVITATION: 3D acoustic levitation in a multi-emitter ultrasound
 * standing wave array. Thousands of levitating microparticle clusters fill the whole working
 * volume of the chamber, trapped on the 3D Chladni acoustic Gor'kov radiation force nodal
 * surfaces, with ultrasonic field glows and photo texturing.
 *   audioAdvance -> navigates 3D acoustic trap focal shifting & particle rotation
 *   audioKick    -> flashes ultrasonic standing wave acoustic pressure antinode bursts
 *   audioSwell   -> enriches acoustic radiation force field strength & particle glow
 *   audioCentroid-> shifts ultrasonic Gor'kov potential color spectra
 *
 * Per-activation variety:
 *   particleSizeP float microparticle cluster cube size      (0.03..0.12)
 *   specularP     float particle facet specular highlight    (0.8..2.5)
 */

in vec3 vNormal;
in vec3 vCol;
in float vAcousticNode;
in vec3 vLocalPos;

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioSwell;

uniform float specularP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

void main()
{
    vec3 lightDir = normalize(vec3(0.5, 0.6, 0.7));
    float diff = max(0.0, dot(vNormal, lightDir));
    float spec = pow(max(0.0, dot(reflect(-lightDir, vNormal), vec3(0.0, 0.0, 1.0))), 24.0) * (specularP > 0.01 ? specularP : 1.2);

    vec3 aPos = abs(vLocalPos);
    float edgeGlow = smoothstep(0.42, 0.5, max(max(aPos.x, aPos.y), aPos.z));

    vec2 photoUv = fract(vLocalPos.xy * 2.0 + 0.5);
    vec3 photo = img(photoUv);

    vec3 col = vCol * (0.6 + 0.4 * photo) * (0.4 + 0.6 * diff);
    col += vec3(0.95, 0.95, 1.0) * spec * (1.0 + 3.0 * audioKick);
    col += vCol * edgeGlow * 1.5;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);

    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    col *= 3.06;   // measured-dark lift (visual pass)
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
