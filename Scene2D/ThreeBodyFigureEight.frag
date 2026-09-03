#version 330 core
out vec4 fragColor;
/**
 * @file ThreeBodyFigureEight.frag
 * @brief THREE BODY FIGURE EIGHT: the figure-eight choreography of the
 * three-body problem -- three equal suns chasing one another around one
 * lemniscate, one third of a period apart.  The suns carry the photo,
 * leave fading trails along the curve, and glow with the bass; the one
 * passing through the centre crossing lights on the kick.  The orbit runs
 * on the scene clock; the camera never moves.
 *
 * Audio Reactivity:
 *   sceneAdvance -> the orbit (continuous)
 *   audioBass    -> sun glow (light)
 *   audioKick    -> the centre crossing flashes (light)
 *   audioSwell   -> trail length (slow)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: sizeP, tiltP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioBass;
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float sizeP;
uniform float tiltP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// The figure eight (a lemniscate of Gerono, close to the true choreography).
vec2 orbit(float t, float sz)
{
    return vec2(sin(t), sin(2.0 * t) * 0.5) * sz;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float sz = (0.55 + 0.2 * clamp(sizeP, 0.0, 1.0)) * aspect * 0.5;
    float tilt = 0.15 * clamp(tiltP, 0.0, 1.0);
    float t = sceneAdvance * 0.9 + sceneTime * 0.2;
    float trail = 1.2 + 2.5 * clamp(audioSwell, 0.0, 1.0);

    // A slight tilt of the orbit plane (fixed per activation).
    mat2 R = mat2(cos(tilt), -sin(tilt), sin(tilt), cos(tilt));

    // Space: dark with round stars and the photo as faint nebula.
    vec3 col = (interpolation * textureLod(tex0, gl_FragCoord.xy / resolution, 4.0) + (1.0 - interpolation) * textureLod(tex1, gl_FragCoord.xy / resolution, 4.0)).rgb;
    col *= imgPalette(hue * 0.159 + 0.6) * 0.18;
    vec2 su = p * 80.0; vec2 sc = floor(su); vec2 sf = fract(su) - 0.5;
    vec2 so = vec2(hash21(sc + 1.3), hash21(sc + 5.9)) - 0.5;
    col += vec3(0.8) * smoothstep(0.14, 0.03, length(sf - so * 0.6)) * step(0.985, hash21(sc));

    // Trails: brightness along the curve behind each body, by phase lag.
    float trailGlow = 0.0;
    vec3 trailCol = vec3(0.0);
    for (int k = 0; k < 3; ++k)
    {
        float tk = t + float(k) * 2.0943951;
        vec3 bc = imgPalette(hue * 0.159 + float(k) * 0.33);
        // March back along the orbit.
        for (int s = 0; s < 40; ++s)
        {
            float lag = float(s) * 0.08;
            vec2 q = R * orbit(tk - lag, sz);
            float d = length(p - q);
            float w = 0.004 + 0.002 * (1.0 - lag / 3.2);
            float g = exp(-d * d / (w * w * 40.0)) * exp(-lag / trail);
            trailGlow += g;
            trailCol += bc * g;
        }
    }
    col += trailCol * 0.5;

    // The suns: photo discs with corona, glowing with the bass; the one at
    // the centre crossing flashes on the kick.
    for (int k = 0; k < 3; ++k)
    {
        float tk = t + float(k) * 2.0943951;
        vec2 c = R * orbit(tk, sz);
        float d = length(p - c);
        float r = 0.06;
        float disc = smoothstep(r, r * 0.85, d);
        vec2 uv = clamp((p - c) / r * 0.5 + 0.5, 0.0, 1.0);
        vec3 face = img(uv) * 1.4 + 0.2;
        vec3 bc = imgPalette(hue * 0.159 + float(k) * 0.33);
        face = mix(face, face * bc * 1.8, 0.35);
        float limb = sqrt(max(1.0 - d * d / (r * r), 0.0));
        face *= 0.5 + 0.6 * limb;
        float corona = exp(-d / (r * 2.5)) * (0.4 + 0.9 * clamp(audioBass, 0.0, 1.0));
        float centre = exp(-length(c) * 6.0);
        col = mix(col, face, disc);
        col += bc * corona * (1.0 + 2.5 * audioKick * centre);
    }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
