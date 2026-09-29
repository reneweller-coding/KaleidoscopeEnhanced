#version 330 core
out vec4 fragColor;
/**
 * @file CHERRY BLOSSOM FRONT: the sakura front arriving along a canal.
 * @brief CHERRY BLOSSOM FRONT: looking down a narrow canal lined with
 * cherry trees whose canopies arch over the water -- stone banks, a path
 * with lanterns, the sky pale with spring.  During the scene arc the
 * blossom front travels toward the camera: far trees burst into pink first,
 * then nearer and nearer ones, until the whole avenue is in flower and the
 * petals come down and gather on the water as drifting pink rafts.  Petals
 * (round) fall on the scene clock; the swell is the spring light, the
 * treble the glitter on the water, the kick a gust that lifts the petals.
 * Camera fixed.
 *
 * Audio Reactivity:
 *   sceneProgress -> the front's advance toward the camera (the arc)
 *   sceneAdvance  -> falling petals, drifting rafts (continuous)
 *   audioSwell    -> spring light (slow)
 *   audioHigh     -> glitter on the water (light)
 *   audioKick     -> a gust brightens the falling petals (light)
 *   audioLevel    -> brightness
 *
 * Per-activation variety: hillsP (canal width), petalP (petal density), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float sceneProgress;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioHigh;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float hillsP;
uniform float petalP;
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
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 3.3; a *= 0.5; }
    return v;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float kick = clamp(audioKick, 0.0, 1.0);
    float prog = clamp(sceneProgress, 0.0, 1.0);
    float halfW = 0.9 + 0.5 * clamp(hillsP, 0.0, 1.0);        // canal half-width (world)
    float dens = 0.5 + 0.8 * clamp(petalP, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.5;

    vec2 vp = vec2(0.0, 0.0);                                   // vanishing point
    float camH = 1.1;
    vec3 light = vec3(1.0, 0.97, 0.94) * (0.85 + 0.3 * swell);
    vec3 pinkC = mix(vec3(1.0, 0.72, 0.82), imgPalette(0.9 + hue * 0.159), 0.15);

    // Sky.
    vec3 col = mix(vec3(0.98, 0.9, 0.86), vec3(0.6, 0.75, 0.92), smoothstep(0.05, 0.5, p.y)) * light;

    // Ground plane below the horizon: canal in the middle, banks either side.
    float wet = 0.0;
    if (p.y < vp.y) {
        float h = vp.y - p.y;
        float z = camH * 0.3 / h;                                // depth
        float x = (p.x - vp.x) * z / 0.3;                        // lateral world
        float fog = smoothstep(2.0, 25.0, z);
        if (abs(x) < halfW) {
            // Water: sky and canopies mirrored, ripples, petal rafts drifting.
            float rip = noise2(vec2(x * 6.0, z * 2.0 - T * 0.4)) - 0.5;
            vec3 refl = mix(vec3(0.55, 0.68, 0.8), pinkC * 0.8, smoothstep(0.4, 1.0, abs(x) / halfW) * smoothstep(0.1, 0.6, prog));
            vec3 w = mix(vec3(0.12, 0.2, 0.22), refl, 0.55 + 0.1 * rip);
            float raft = smoothstep(0.55, 0.75, fbm(vec2(x * 1.2, z * 0.5 - T * 0.08)) + 0.3 * prog - 0.2);
            raft *= smoothstep(0.5, 1.0, prog);
            w = mix(w, pinkC * 0.95, raft * 0.85);
            w += vec3(1.0) * pow(max(rip + 0.5, 0.0), 12.0) * (0.2 + 0.8 * hi) * 0.4;
            col = w * light;
            wet = 1.0;
        } else if (abs(x) < halfW + 0.5) {
            // Stone bank wall top edge and the path.
            float blk = step(0.9, fract(z * 2.0)) + step(0.92, fract(abs(x) * 3.0));
            col = mix(vec3(0.55, 0.52, 0.48), vec3(0.4, 0.38, 0.35), clamp(blk, 0.0, 1.0)) * light;
        } else {
            // Grass under the trees, dusted with petals.
            vec3 grass = mix(vec3(0.36, 0.44, 0.28), vec3(0.5, 0.55, 0.38), noise2(vec2(x, z) * 3.0));
            float dust = smoothstep(0.6, 0.8, noise2(vec2(x, z) * 8.0)) * smoothstep(0.6, 1.0, prog);
            col = mix(grass, pinkC, dust) * light;
        }
        col = mix(col, vec3(0.95, 0.9, 0.9) * light, fog);
    }

    // The trees: two rows along the banks, far to near.  Each canopy is a
    // cloud of round blossom clusters that fills in as the front arrives.
    for (int s = 0; s < 2; ++s) {
        float side = (s == 0) ? -1.0 : 1.0;
        for (int k = 13; k >= 0; --k) {
            float fk = float(k);
            float z = 1.9 + fk * 1.5;
            float tx = side * (halfW + 0.9 + 0.15 * hash11(fk + side * 7.0));
            float sc = 0.3 / z;
            vec2 base = vp + vec2(tx * sc, -camH * sc);          // trunk foot on screen
            float treeH = (2.1 + 0.4 * hash11(fk * 3.1 + side)) * sc;
            vec2 d = p - base;
            // The front: far trees bloom first, the near ones last.
            float bloom = smoothstep(0.0, 0.2, prog * 2.2 - (1.0 - fk / 13.0) * 1.0);
            // Trunk: a leaning dark line.
            float lean = -side * 0.25;
            float trunkX = d.x - lean * d.y;
            float trunk = smoothstep(0.07 * sc, 0.035 * sc, abs(trunkX)) * step(0.0, d.y) * step(d.y, treeH * 0.85);
            col = mix(col, vec3(0.18, 0.12, 0.1), trunk);
            // Canopy: leaning over the water, a lumpy cloud of clusters.
            vec2 cc = base + vec2(lean * treeH * 0.8 - side * 0.55 * sc, treeH * 0.95);
            vec2 cq = (p - cc) / (sc * vec2(1.6, 0.95));
            float blob = length(cq) - 1.0 + 0.35 * (fbm(cq * 2.0 + fk * 3.0 + side) - 0.5);
            if (blob < 0.25) {
                // Main branches: a few bent strokes fanning out from the trunk top.
                float brd = 1e9;
                vec2 top = base + vec2(lean * treeH * 0.85, treeH * 0.85);
                for (int b = 0; b < 4; ++b) {
                    float fb = float(b);
                    float ang = 1.57 + side * (-0.9 + 0.55 * fb) + 0.3 * (hash11(fk * 5.0 + fb) - 0.5);
                    vec2 dir = vec2(cos(ang), sin(ang));
                    vec2 e = top + dir * treeH * (0.55 + 0.25 * hash11(fk + fb * 3.0));
                    vec2 pa = p - top, ba = e - top;
                    float hb = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
                    brd = min(brd, length(pa - ba * hb) / (sc * (0.05 - 0.03 * hb)));
                }
                float branch = smoothstep(1.0, 0.6, brd);
                // Blossom clusters: round jittered balls, lit from above.
                vec2 gq = (p - cc) / (sc * 0.13) + fk * 3.7 + side * 1.3;        // isotropic: round clusters
                vec2 gi = floor(gq), gf = fract(gq);
                float f1 = 9.0; float lit = 0.0;
                for (int j = -1; j <= 1; ++j)
                for (int i = -1; i <= 1; ++i) {
                    vec2 o = vec2(i, j);
                    vec2 c = o + 0.2 + 0.6 * vec2(hash21(gi + o), hash21(gi + o + 5.0));
                    float r = 0.38 + 0.2 * hash21(gi + o + 9.0);
                    float dd = length(gf - c) / r;
                    if (dd < f1) { f1 = dd; lit = clamp(0.5 + (gf.y - c.y) / r * 0.6, 0.0, 1.0); }
                }
                float inside = smoothstep(0.1, -0.1, blob);
                float cover = smoothstep(1.0, 0.85, f1) * inside * smoothstep(0.0, 0.3, bloom + 0.1 * (hash21(gi) - 0.5)) * step(0.01, bloom);
                vec3 bl = mix(pinkC, vec3(1.0, 0.92, 0.95), 0.35 * hash21(gi + 2.0)) * (0.7 + 0.45 * lit) * (0.9 + 0.2 * smoothstep(-0.6, 0.8, cq.y));
                float farFade = 1.0 - smoothstep(10.0, 25.0, z) * 0.6;
                col = mix(col, vec3(0.22, 0.15, 0.12) * light, branch * farFade);
                col = mix(col, pinkC * 0.62 * light, inside * smoothstep(0.1, 0.5, bloom) * 0.75 * farFade);
                col = mix(col, bl * light, cover * farFade);
            }
            // A paper lantern on the path side, near trees only.
            if (k < 8) {
                vec2 lp = base + vec2(side * 0.35 * sc, 0.55 * sc);
                float lan = length((p - lp) / (sc * vec2(0.12, 0.17)));
                col = mix(col, vec3(1.0, 0.6, 0.3) * (1.2 + 0.4 * swell), smoothstep(1.0, 0.8, lan));
            }
        }
    }

    // Falling petals: round, drifting sideways as they fall; a gust (kick)
    // lights them up.
    for (int L = 0; L < 3; ++L) {
        float fl = float(L);
        float sz = 0.004 + 0.003 * fl;
        vec2 q = p * (18.0 - 4.0 * fl) + vec2(T * 0.25 + sin(T * 0.3 + fl) * 0.5, T * (0.6 + 0.2 * fl));
        vec2 qi = floor(q), qf = fract(q) - 0.5;
        float hh = hash21(qi + fl * 13.0);
        vec2 off = (vec2(hash21(qi + 3.0), hash21(qi + 7.0)) - 0.5) * 0.6;
        float r = length((qf - off) * vec2(1.0, 1.5));
        float pet = smoothstep(0.12 + 0.03 * fl, 0.06, r) * step(1.0 - 0.18 * dens * smoothstep(0.3, 0.9, prog), hh);
        col = mix(col, pinkC * (1.05 + 0.4 * kick), pet * 0.9);
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
