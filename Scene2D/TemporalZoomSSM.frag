#version 330 core
out vec4 fragColor;
/**
 * @file TemporalZoomSSM.frag
 * @brief TEMPORAL ZOOM: the song zooms into itself.  The self-similarity
 * matrix (texSSM) is drawn as a square field, and the picture is a nest of
 * that field at time scales that shrink by four -- the whole ring, a
 * quarter of it, a sixteenth -- so the block structure of sections, the
 * lattice of phrases and the fine grid of beats are all the same picture
 * at different depths.  The zoom runs through those scales on the scene
 * clock; because the matrix's structure repeats across scales (music is
 * self-similar in time), the nest is what keeps the zoom from ever ending.
 * A returning section warms the field; the kick lights the diagonal.
 *
 * Audio Reactivity:
 *   texSSM            -> the picture (the whole point)
 *   sceneAdvance      -> the zoom (continuous, periodic in one scale step)
 *   audioSectionKnown -> warmth (light)
 *   audioKick         -> the diagonal (now) flashes (light)
 *   audioLevel        -> brightness
 *
 * Per-activation variety: zoomP (rate), tiltP (view angle), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform sampler2D texSSM;
uniform float ssmHead;
uniform float ssmFill;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSectionKnown;
uniform float audioKick;
uniform float audioLevel;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioValence;

uniform float zoomP;
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

// Similarity of the moments a and b ago (0 = now, 1 = the whole ring back).
float ssm(float a, float b)
{
    return texture(texSSM, vec2(ssmHead - a, ssmHead - b)).r;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    const float L = 1.3862944;                       // ln 4: one scale step
    float zoom = sceneAdvance * 0.16 * (zoomP > 0.05 ? zoomP : 1.0) + sceneTime * 0.03;
    float zf = mod(zoom, L);
    float fill = max(ssmFill, 0.15);

    // A slight perspective tilt so the field reads as a floor receding.
    float tilt = 0.15 + 0.25 * clamp(tiltP, 0.0, 1.0);
    vec2 q = vec2(p.x, p.y) ;
    float persp = 1.0 / (1.0 + tilt * (q.y + 0.6));
    q *= persp;

    // The nest: the field at scale s_k = fill * 4^-k, anchored at "now" (the
    // ring head = the corner), zoomed by exp(zf).  Layer k covers the square
    // [0, s_k] of ages; layers fade in and out with their apparent size.
    vec3 col = vec3(0.0);
    float wsum = 0.0;
    for (int k = -1; k <= 2; ++k)
    {
        float ls = zf + float(k) * L;                 // log apparent scale
        float S = 0.9 * exp(ls);                       // apparent half-size on screen of this layer's square
        vec2 uvk = (q + vec2(S)) / (2.0 * S);          // 0..1 across the layer's square
        float inside = step(0.0, uvk.x) * step(uvk.x, 1.0) * step(0.0, uvk.y) * step(uvk.y, 1.0);
        float ageA = uvk.x * fill * exp(-float(k) * L) * 0.25;   // this layer spans a quarter^k of the ring
        float ageB = uvk.y * fill * exp(-float(k) * L) * 0.25;
        float sim = ssm(ageA, ageB);
        float w = clamp(1.0 - abs(ls) / (1.5 * L), 0.0, 1.0) * inside;
        vec3 layerCol = imgPalette(hue * 0.159 + 0.15 + 0.2 * float(k + 1)) * pow(clamp(sim, 0.0, 1.0), 1.5) * 1.6;
        // Grid lines of the layer's own beat lattice.
        float grid = exp(-min(fract(uvk.x * 8.0), 1.0 - fract(uvk.x * 8.0)) * 30.0) + exp(-min(fract(uvk.y * 8.0), 1.0 - fract(uvk.y * 8.0)) * 30.0);
        layerCol += imgPalette(hue * 0.159 + 0.6) * grid * 0.08;
        // The diagonal is "now against now": a bright line, flashing on the kick.
        float diag = exp(-abs(uvk.x - uvk.y) * 40.0);
        layerCol += imgPalette(hue * 0.159 + 0.9) * diag * (0.15 + 0.7 * audioKick);
        col += layerCol * w;
        wsum += w;
    }
    col /= max(wsum, 1e-3);
    col = mix(col, col * imgPalette(hue * 0.159 + 0.05) * 2.0, 0.4 * clamp(audioSectionKnown, 0.0, 1.0));
    col += imgPalette(hue * 0.159 + 0.4) * 0.03;
    col *= (0.7 + 0.5 * audioLevel) * (0.85 + 0.35 * audioSwell);
    col *= 1.0 - 0.4 * smoothstep(0.7, 1.15, length(p));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
