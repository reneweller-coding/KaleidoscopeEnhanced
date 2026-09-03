#version 330 core
out vec4 fragColor;
/**
 * @file GravityLensingZoom.frag
 * @brief GRAVITY LENSING ZOOM: an endless zoom into the photo through a
 * chain of gravitational lenses.  The picture lives in log-polar space and
 * repeats every zoom period, so the fall never ends and never wraps
 * visibly; along the way point-mass lenses sit at fixed places in that
 * space, each bending the picture into an Einstein ring and a pair of
 * arcs.  The lens masses swell slowly with the music; the bass lights the
 * rings, nothing fast moves the picture.
 *
 * Audio Reactivity:
 *   sceneAdvance -> the fall (music-paced, periodic)
 *   audioSwell   -> lens mass (slow: rings widen on builds)
 *   audioBass    -> ring glow (light)
 *   audioKick    -> arcs flash (light)
 *   audioLevel   -> overall brightness
 *
 * Per-activation variety: zoomP (fall rate), massP (base mass), hueP.
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
uniform float audioBass;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float zoomP;
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

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    const float L = 1.6;                       // zoom period in log-radius
    float zoom = sceneAdvance * 0.2 * (zoomP > 0.05 ? zoomP : 1.0) + sceneTime * 0.03;
    float m = floor(zoom / L);
    float zf = zoom - m * L;

    // Picture space: the pixel scaled by the zoom.  Lenses sit at fixed
    // places per period; we handle the current period and its neighbours.
    vec2 q = p * exp(-zf);                     // shrink as we fall in
    // Small masses: the Einstein radius must stay well below the lens
    // spacing, or the whole picture collapses into one deflection.
    float mass = (0.006 + 0.008 * clamp(massP, 0.0, 1.0)) * (1.0 + 0.6 * clamp(audioSwell, 0.0, 1.0));

    vec2 uvq = q;
    float ringGlow = 0.0, arcGlow = 0.0;
    for (int k = -1; k <= 2; ++k)
    {
        float per = m + float(k);
        // One lens per period, on a ring of radius exp(-... ) scaled to this
        // period: they line up along the fall like beads.
        float scale = exp(-float(k) * L);
        float ang = hash11(per * 3.7) * 6.2831853;
        vec2 c = vec2(cos(ang), sin(ang)) * 0.25 * scale;
        float thetaE2 = mass * scale * scale;          // Einstein radius^2 at this scale
        vec2 d = uvq - c;
        float dd = max(dot(d, d), 1e-6);
        // Point-mass deflection: the source position is the image minus
        // thetaE^2 * d / |d|^2.
        uvq -= thetaE2 * d / dd;
        float thetaE = sqrt(thetaE2);
        float rr = sqrt(dd);
        ringGlow += exp(-abs(rr - thetaE) / (thetaE * 0.25 + 1e-4)) * scale;
        arcGlow  += exp(-abs(rr - thetaE * 1.6) / (thetaE * 0.4 + 1e-4)) * scale * 0.4;
    }

    // Endless zoom by layered copies of the photo: copy k has size
    // s0 * exp(zf + k L); it fades in while small and out while large, and at
    // the wrap of zf layer k becomes layer k+1 with the same size, so the
    // fall never ends and never jumps.  Mipmapped, no log-polar aliasing.
    // Endless zoom: the photo wrapped on a tunnel (angle, log radius) with
    // the log-radius period EQUAL to the zoom period L, so the wrap of the
    // zoom is exact -- a period of anything else flickered at every wrap.
    // The lensed coordinates go in, so the rings bend the tunnel.
    float lr = log(length(uvq) + 1e-4);
    float an = atan(uvq.y, uvq.x) * 0.15915494;
    vec2 uv = vec2(fract(an * 2.0 + lr / L), fract(lr / L));
    vec3 tex = img(uv);
    vec3 col = tex * (0.45 + 0.4 * audioLevel) * mix(vec3(1.0), imgPalette(hue * 0.159 + 0.6) * 1.6, 0.25);
    // Depth: the far centre darkens (fog rises with distance, correct sign).
    col *= smoothstep(0.0, 0.3, length(p)) * (1.0 - 0.3 * smoothstep(0.6, 1.1, length(p)));

    col += imgPalette(hue * 0.159 + 0.9) * ringGlow * (1.2 + 2.0 * audioBass);
    col += imgPalette(hue * 0.159 + 0.5) * arcGlow * (0.8 + 2.0 * audioKick);
    col *= 1.0 - 0.45 * smoothstep(0.55, 1.1, length(p));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
