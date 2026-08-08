#version 120
// PhotoVortex.frag — the image is dragged into the throat: texture rings
// stream inward, stretching as they fall; the throat glows on the drop.
uniform sampler2D tex0;
uniform float time;
uniform float audioAdvance;
uniform float audioDrop;
uniform float audioKick;
uniform float audioChromaHue;

varying vec2  vUV;
varying float vDepth;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
vec2 mfold(vec2 uv) { return abs(fract(uv * 0.5) * 2.0 - 1.0); }

void main()
{
    // The image streams toward the throat (v runs with the music) and is
    // wound around the funnel; four mirrored sectors keep it seamless.
    float a = vUV.x * 4.0;
    a = abs(fract(a) * 2.0 - 1.0);
    vec2 uv = vec2(a * 1.4,
                   vUV.y * 4.5 + time * 0.35 + audioAdvance * 1.3);
    vec3 col = texture2D(tex0, mfold(uv)).rgb;

    // Darker toward the throat, with a glowing vortex eye that answers the
    // kick and blazes on a drop.
    col *= mix(1.0, 0.25, pow(vDepth, 1.7));
    float eye = pow(vDepth, 6.0);
    col += hueRot(vec3(0.9, 0.45, 0.15), audioChromaHue)
         * eye * (0.8 + 1.6 * audioKick + 3.0 * audioDrop);

    // Faint spiral streak lines.
    float streak = smoothstep(0.85, 1.0,
                              abs(fract(vUV.x * 24.0) - 0.5) * 2.0);
    col *= 1.0 - 0.25 * streak * (1.0 - vDepth);

    gl_FragColor = vec4(col * 1.25, 1.0);
}
