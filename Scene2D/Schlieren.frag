#version 330 core
out vec4 fragColor;
/**
 * @file Schlieren.frag
 * @brief KNIFE-EDGE SCHLIEREN OPTICS over the live GPU fluid: the classic
 * wind-tunnel photography technique, synthesised.  Real schlieren imaging
 * makes invisible density gradients visible — a knife edge in the focal
 * plane converts refraction-angle into brightness, so pressure waves and
 * convection plumes appear as dramatic light/dark streaks.
 *
 * Here the "medium" is the engine's curl-noise fluid simulation (texFluid,
 * unit 8 — declaring it makes the host step the sim automatically).  The
 * dye field's luminance acts as the density field:
 *   * brightness = 0.5 + k * (gradient · knife-edge direction)  — the
 *     authentic monochrome schlieren look, edge direction slowly turning;
 *   * a RAINBOW-FILTER variant (real labs use a colour filter instead of
 *     the knife edge) tints by gradient DIRECTION;
 *   * the source image is refracted through the flow like looking through
 *     moving hot air.
 * The photo is continuously injected as dye by the sim, so the flow itself
 * carries the picture's colours through the optics.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform sampler2D texFluid;    // fluid dye state (RGB), sim-stepped by host
uniform float interpolation;

uniform float audioBass;
uniform float audioOnset;
uniform float audioSwell;
uniform float audioPhase;
uniform float audioChromaHue;
uniform float audioCentroid;
uniform float audioDrop;
uniform float audioLevel;

// Per-activation variety:
uniform int   sidesP;          // kaleido fold (0/1 off; 2..8)
uniform float strengthP;       // schlieren gain      (0 -> 1.0; 0.6..1.8)
uniform float rainbowP;        // 0 knife-edge mono .. 1 colour-filter mode

const float PI = 3.14159265358979;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 img(vec2 uv) { return (interpolation * texture(tex0, uv)
                          + (1.0 - interpolation) * texture(tex1, uv)).rgb; }
vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
vec2 kaleido(vec2 p, float sides)
{
    float a   = atan(p.y, p.x);
    float r   = length(p);
    float seg = PI / sides;
    a = mod(a + PI, 2.0 * seg) - seg;
    a = abs(a);
    return vec2(cos(a), sin(a)) * r;
}

float dens(vec2 uv)
{
    vec3 d = texture(texFluid, uv).rgb;
    return dot(d, vec3(0.299, 0.587, 0.114));
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;

    // Field coordinates (optionally kaleido-folded, slowly turning).
    vec2 fuv;
    if (sidesP >= 2)
    {
        vec2 cp = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
        cp = rot(time * 0.014 + audioPhase * 0.05) * cp;
        fuv = kaleido(cp, float(sidesP)) * 0.8 + 0.5;
    }
    else
        fuv = uv;

    // Smoothed density gradient (the refraction field).
    vec2 px = vec2(2.0) / vec2(512.0);      // fluid sim grid is 512^2
    float gx = dens(fuv + vec2(px.x, 0.0)) - dens(fuv - vec2(px.x, 0.0));
    float gy = dens(fuv + vec2(0.0, px.y)) - dens(fuv - vec2(0.0, px.y));
    vec2  grad = vec2(gx, gy);
    float gmag = length(grad);

    float gain = ((strengthP <= 0.01) ? 1.0 : strengthP)
               * (14.0 + 10.0 * audioSwell + 8.0 * audioBass);

    // ---- Knife-edge channel: gradient projected on a slowly turning edge.
    float edgeAng = time * 0.05 + audioPhase * 0.10;
    vec2  knife = vec2(cos(edgeAng), sin(edgeAng));
    float schlier = 0.5 + dot(grad, knife) * gain;

    // ---- Rainbow-filter channel: direction -> hue, magnitude -> saturation.
    float dirAng = atan(grad.y, grad.x);
    vec3  rain = hueRot(vec3(1.0, 0.25, 0.15),
                        dirAng + audioChromaHue * 6.2831853 * 0.15915);
    rain *= clamp(gmag * gain * 1.6, 0.0, 1.0);

    // The photo seen THROUGH the flow (heat-haze refraction).
    vec3 pic = img(fract(uv + grad * (2.2 + 1.5 * audioSwell)));

    // Compose: dim refracted picture below, schlieren streaks on top.
    float mono = clamp(schlier, 0.0, 1.0);
    // Contrast curve around the mid-grey (knife edge sits at 0.5).
    mono = mono * mono * (3.0 - 2.0 * mono);
    vec3 knifeCol = vec3(mono) * mix(vec3(1.0, 0.98, 0.92),
                                     vec3(0.85, 0.92, 1.05), audioCentroid);

    float rb = clamp((rainbowP <= 0.01) ? 0.35 : rainbowP, 0.0, 1.0);
    vec3 optics = mix(knifeCol, rain + vec3(0.18), rb);

    vec3 col = pic * (0.30 + 0.25 * audioLevel);
    col += optics * (0.75 + 0.35 * audioOnset);
    // Strong fronts flash with the music.
    col += hueRot(vec3(0.9, 0.6, 0.2), audioChromaHue)
         * clamp(gmag * gain - 0.6, 0.0, 1.0) * (0.4 + 1.2 * audioDrop);

    col /= 1.0 + 0.55 * max(col.r, max(col.g, col.b));   // over-bright tail (final review)
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
