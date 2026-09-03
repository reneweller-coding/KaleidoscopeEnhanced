#version 330 core
out vec4 fragColor;
/**
 * @file MicrolensingCausticSweep.frag
 * @brief MICROLENSING CAUSTIC SWEEP: a pair of point-mass lenses drifts
 * across a star field, and where their caustics -- the folds of the lens
 * map -- pass over a star, it flares: that is a microlensing event, and
 * here it happens all over the sky.  The star field is sampled through the
 * lens map (each pixel asks which source it sees), and the magnification is
 * the inverse Jacobian of that map, so the caustic curves appear as lines
 * of light where the map folds.  The lenses glide on the scene clock; the
 * swell is their mass (slow).  The camera never moves.
 *
 * Audio Reactivity:
 *   sceneAdvance -> the lenses drift, the caustics sweep (continuous)
 *   audioSwell   -> lens mass (slow)
 *   audioKick    -> the lenses' own dark discs ring with light (light)
 *   audioLevel   -> star brightness
 *
 * Per-activation variety: sepP (lens separation), massP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float sepP;
uniform float massP;
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

// Source plane: a star field (round, jittered) plus the photo as a faint
// background nebula.
vec3 sourceAt(vec2 s, float hue)
{
    vec2 su = s * 40.0;
    vec2 cell = floor(su); vec2 f = fract(su) - 0.5;
    float hs = hash21(cell);
    vec2 off = vec2(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5;
    float star = smoothstep(0.24, 0.03, length(f - off * 0.6)) * step(0.93, hs);
    vec3 starCol = mix(vec3(1.0), imgPalette(hue * 0.159 + hash21(cell + 1.1) * 0.5), 0.35) * (0.5 + 0.9 * hash21(cell + 9.9));
    vec3 neb = img(fract(s * 0.25 + 0.5)) * imgPalette(hue * 0.159 + 0.6) * 0.5;
    return starCol * star * 1.5 + neb;
}

// The lens map: image position -> source position, two point masses.
vec2 lensMap(vec2 x, vec2 c1, vec2 c2, float m1, float m2)
{
    vec2 d1 = x - c1, d2 = x - c2;
    return x - m1 * d1 / max(dot(d1, d1), 1e-5) - m2 * d2 / max(dot(d2, d2), 1e-5);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float mass = (0.012 + 0.02 * clamp(massP, 0.0, 1.0)) * (0.8 + 0.7 * clamp(audioSwell, 0.0, 1.0));
    float sep = 0.18 + 0.25 * clamp(sepP, 0.0, 1.0);
    // The pair drifts across and turns slowly.
    float t = sceneAdvance * 0.12 + sceneTime * 0.02;
    vec2 centre = vec2(0.9 * sin(t * 0.5), 0.4 * sin(t * 0.37 + 1.0));
    float ang = t * 0.4;
    vec2 arm = vec2(cos(ang), sin(ang)) * sep * 0.5;
    vec2 c1 = centre + arm, c2 = centre - arm;

    // Magnification from the Jacobian of the lens map (finite differences).
    const float e = 0.0015;
    vec2 s0 = lensMap(p, c1, c2, mass, mass);
    vec2 sx = lensMap(p + vec2(e, 0.0), c1, c2, mass, mass);
    vec2 sy = lensMap(p + vec2(0.0, e), c1, c2, mass, mass);
    mat2 J = mat2((sx - s0) / e, (sy - s0) / e);
    float det = abs(J[0][0] * J[1][1] - J[0][1] * J[1][0]);
    float mag = clamp(1.0 / max(det, 0.02), 0.0, 30.0);

    vec3 col = sourceAt(s0, hue) * (0.6 + 0.5 * mag) * (0.7 + 0.5 * audioLevel);
    // The caustic lines themselves: a soft glow where the magnification
    // diverges.
    float caustic = smoothstep(4.0, 30.0, mag);
    col += imgPalette(hue * 0.159 + 0.9) * caustic * 1.2;
    // The lenses: dark discs with a ring that lights on the kick.
    for (int k = 0; k < 2; ++k)
    {
        vec2 c = (k == 0) ? c1 : c2;
        float r = length(p - c);
        float thetaE = sqrt(mass);
        col *= smoothstep(thetaE * 0.25, thetaE * 0.4, r);
        col += imgPalette(hue * 0.159 + 0.1) * exp(-abs(r - thetaE) * 30.0) * (0.15 + 0.8 * audioKick);
    }

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
