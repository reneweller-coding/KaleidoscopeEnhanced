#version 330 core
out vec4 fragColor;
/**
 * @file NighthawksDiner.frag
 * @brief NIGHTHAWKS DINER: a corner diner late at night in the manner of
 * Edward Hopper -- a wedge of glass wall pouring green-yellow fluorescent
 * light onto an empty street, the long counter inside, a few still
 * figures on stools, the coffee urns, and across the street the dark
 * shopfronts and windows above, one of them faintly lit.  The light is
 * hard and flat, the shadows cut clean, the colours those of the painting:
 * sickly green, cherry wood, deep teal night.  Nothing moves but light;
 * the neon sign on the roof hums with the music.
 *
 * Audio Reactivity:
 *   audioSwell  -> the fluorescent light (slow)
 *   audioKick   -> the neon sign flickers brighter (light only)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> a slow flicker of one tube, steam from the urns
 *
 * Per-activation variety: figuresP (how many sit at the counter), hueP.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneTime;
uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioKick;
uniform float audioLevel;
uniform float audioValence;
uniform float audioChromaHue;

uniform float figuresP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

float hash21(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }

// Painterly grain: Hopper's flat colour has a slight brush texture.
float grain(vec2 p) { return 0.94 + 0.06 * noise2(p * vec2(90.0, 30.0)) + 0.03 * noise2(p * 400.0); }

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float kick = clamp(audioKick, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    float nFig = 2.0 + floor(clamp(figuresP, 0.0, 1.0) * 2.99);

    vec3 fluo = vec3(0.95, 1.0, 0.82) * (0.9 + 0.25 * swell);
    fluo *= 0.97 + 0.03 * step(0.97, noise2(vec2(T * 3.0, 1.0)));          // one tube not quite steady
    vec3 night = vec3(0.04, 0.1, 0.12);
    vec3 col = night;

    // Across the street (upper band): dark brick shopfronts, windows above.
    if (p.y > 0.02) {
        vec3 brick = vec3(0.18, 0.1, 0.08);
        vec2 wq = vec2(p.x * 6.0, (p.y - 0.05) * 7.0);
        vec2 wi = floor(wq), wf = fract(wq);
        float win = step(0.25, wf.x) * step(wf.x, 0.75) * step(0.2, wf.y) * step(wf.y, 0.8);
        vec3 wc = vec3(0.03, 0.06, 0.07);
        if (wi == vec2(4.0, 1.0)) wc = vec3(0.6, 0.45, 0.2);                 // one lit window
        col = mix(brick * 0.4, wc, win);
        // The diner's light washes the lower facade opposite.
        col += fluo * vec3(0.4, 0.45, 0.3) * exp(-(p.y - 0.05) * 4.0) * 0.25;
        col *= grain(p);
    }
    // Sidewalk and street.
    if (p.y <= 0.02) {
        col = mix(vec3(0.03, 0.07, 0.08), vec3(0.05, 0.09, 0.09), smoothstep(-0.5, 0.05, p.y));
        // The pool of light the diner throws on the pavement.
        vec2 lq = p - vec2(-0.1, -0.3);
        col += fluo * vec3(0.55, 0.6, 0.35) * exp(-dot(lq * vec2(0.9, 2.0), lq * vec2(0.9, 2.0)) * 3.0) * 0.3;
        col *= grain(p + 3.0);
    }

    // The diner in perspective: its glass front runs from the corner near
    // us (right) away to a vanishing point far to the left, top and bottom
    // edges converging -- the long diagonal of the painting.
    vec2 vp = vec2(-2.2, 0.02);
    float xN = 0.62;                                 // the near corner
    float bN = -0.36, tN = 0.3;                      // bottom / top at the corner
    float k = (p.x - vp.x) / (xN - vp.x);            // 1 at the corner, shrinking with depth
    float yb = vp.y + (bN - vp.y) * k, yt = vp.y + (tN - vp.y) * k;
    // Rounded corner: the glass curves round to the right.
    float inFront = step(p.x, xN) * step(-0.95, p.x);
    float bodyMask = inFront * step(yb, p.y) * step(p.y, yt);
    float t = (p.y - yb) / max(yt - yb, 1e-4);       // 0 bottom .. 1 top of the front
    float sx = (p.x - vp.x) / (xN - vp.x);           // position along the front (depth-ish)
    if (bodyMask > 0.0) {
        vec3 inside = fluo * vec3(0.62, 0.72, 0.5);
        // Back wall, pale yellow above the counter; a doorway to the kitchen.
        inside = mix(inside, vec3(1.0, 0.92, 0.62) * (0.8 + 0.3 * t), step(0.42, t));
        // The ceiling strip lights: a bright band just under the roof.
        inside += vec3(1.0, 1.0, 0.9) * exp(-abs(t - 0.84) * 60.0) * 0.8;
        float door = step(abs(sx - 0.93), 0.015) * step(0.42, t) * step(t, 0.82);
        inside = mix(inside, vec3(0.55, 0.45, 0.25) * fluo, door * 0.6);
        // Two coffee urns near the corner.
        for (int u = 0; u < 2; ++u) {
            float ux = 0.86 + 0.035 * float(u);
            vec2 uq = vec2((sx - ux) / 0.011, (t - 0.5) / 0.08);
            float urn = step(length(vec2(uq.x, max(abs(uq.y) - 0.6, 0.0))), 1.0);
            float sh = 0.6 + 0.4 * smoothstep(0.8, -0.6, uq.x);
            inside = mix(inside, vec3(0.8, 0.8, 0.72) * fluo * sh, urn);
        }
        // Steam from the urns.
        float st = smoothstep(0.55, 0.8, noise2(vec2(sx * 60.0, t * 10.0 - T * 0.3))) * smoothstep(0.66, 0.75, t) * exp(-abs(sx - 0.865) * 40.0);
        inside += vec3(0.8) * st * 0.2;
        // The counter: cherry-wood top, pale front, running the length.
        float ctop = smoothstep(0.02, 0.0, abs(t - 0.34) - 0.025);
        float cfront = step(0.12, t) * step(t, 0.315);
        inside = mix(inside, vec3(0.85, 0.8, 0.6) * fluo * 0.9, cfront);
        inside = mix(inside, vec3(0.55, 0.18, 0.08), ctop);
        // Stools: round seats on posts.
        float stoolX = fract(sx * 22.0) - 0.5;
        float stool = step(abs(stoolX), 0.12) * step(0.08, t) * step(t, 0.2) * step(0.35, sx);
        inside = mix(inside, vec3(0.15, 0.1, 0.08), stool * step(abs(stoolX), 0.04 + 0.1 * step(0.17, t)));
        // Figures: hunched backs over the counter -- rounded shapes, a hat,
        // the woman in red.  Sizes follow the perspective (in t / sx).
        for (int f = 0; f < 4; ++f) {
            if (float(f) >= nFig) break;
            float fx = 0.5 + 0.09 * float(f) + 0.02 * step(1.5, float(f));
            vec2 fq = vec2((sx - fx) * 34.0 * (1.0 + 0.1 * float(f)), (t - 0.36) * 5.0);
            float back = length(vec2(fq.x * 1.2, max(fq.y - 0.35, 0.0) * 0.9 + min(fq.y, 0.0) * 1.5)) - 0.55;
            float head = length(fq - vec2(0.15, 1.05)) - 0.24;
            float hat = max(abs(fq.y - 1.26) - 0.07, abs(fq.x - 0.15) - 0.38);
            hat = min(hat, max(abs(fq.y - 1.36) - 0.12, abs(fq.x - 0.15) - 0.2));
            bool red = (f == 1);
            vec3 cl = red ? vec3(0.78, 0.12, 0.1) : vec3(0.1, 0.12, 0.18);
            vec3 skin = vec3(0.9, 0.62, 0.45) * fluo;
            float shade = 0.75 + 0.35 * smoothstep(0.6, -0.4, fq.x);
            inside = mix(inside, cl * fluo * shade, smoothstep(0.03, -0.03, back));
            inside = mix(inside, skin * shade, smoothstep(0.03, -0.03, head));
            if (!red) inside = mix(inside, vec3(0.1, 0.1, 0.12), smoothstep(0.03, -0.03, hat) * step(0.5, fract(float(f) * 0.61 + 0.3)));
            else inside = mix(inside, vec3(0.75, 0.3, 0.1), smoothstep(0.03, -0.03, length(fq - vec2(0.1, 1.15)) - 0.26) * step(fq.x, 0.2));   // her hair
        }
        // The dark wooden base below the glass and the roof band above.
        inside = mix(inside, vec3(0.42, 0.12, 0.07) * (0.7 + 0.3 * t * 8.0), step(t, 0.1));
        inside = mix(inside, vec3(0.07, 0.18, 0.16), step(0.86, t));
        // Glass mullions: thin dark verticals at intervals along the front.
        float mull = smoothstep(0.004, 0.0, abs(fract(sx * 5.0) - 0.5) - 0.495 + 0.004) * step(0.1, t) * step(t, 0.86);
        inside = mix(inside, vec3(0.1, 0.12, 0.1), mull * 0.8);
        col = inside * 2.4 * grain(vec2(sx * 3.0, t));
        // The sign on the roof band.
        float sgn = step(abs(t - 0.93), 0.03) * step(0.55, sx) * step(sx, 0.95) * step(0.4, fract(sx * 60.0));
        col += vec3(1.0, 0.55, 0.25) * sgn * (0.8 + 0.7 * kick);
    }
    // Beyond the corner: the building's dark side wall going up.
    if (p.x > xN && p.y > yb - 0.05) col = mix(col, vec3(0.06, 0.08, 0.08) * grain(p), step(p.y, tN + 0.25));
    // The light the glass throws onto the pavement in front of it.
    if (p.y < yb && inFront > 0.0) {
        float d = (yb - p.y) / max(k, 0.05);
        col += fluo * vec3(0.5, 0.55, 0.3) * exp(-d * 5.0) * 0.5;
    }
    col = mix(col, col * imgPalette(0.4 + hueP * 0.159) * 1.4, 0.08);
    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
