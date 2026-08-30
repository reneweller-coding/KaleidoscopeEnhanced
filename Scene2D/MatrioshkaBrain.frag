#version 330 core
out vec4 fragColor;
/**
 * @file MatrioshkaBrain.frag
 * @brief MATRIOSHKA BRAIN: Flight through the endless, glowing computing layers
 * of a megastructure that completely encases a star. Dense, geometric pathways
 * and data streams pulse violently to the music.
 *   audioAdvance -> flight speed through the computational layers
 *   audioKick    -> flashes from massive data processing nodes
 *   audioSwell   -> ambient brightness of the energy pathways
 *   audioChromaHue-> palette offset for the data streams
 *
 * Per-activation variety:
 *   techP float complexity of the computational architecture (0.5..1.5)
 *   dataP float intensity of the data stream pulses (0.5..2.0)
 *   hueP float palette offset (0..6.28)
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioChromaHue;

uniform float techP;
uniform float dataP;
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

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hash31(vec3 p)  { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float hitMat = 0.0;
float hitGlow = 0.0;

// Fractal Menger-sponge-like structure for the computational layers
float map(vec3 p, float tp) {
    float d = 1e10;
    float mat = 0.0;
    float glow = 0.0;

    // Main structural shaft
    vec3 q = abs(p);
    float shaft = 2.0 - max(q.x, q.y); // hollow square tunnel
    if (shaft < d) { d = shaft; mat = 1.0; }

    // Repetition for layers
    vec3 c = floor(p);
    vec3 lq = fract(p) - 0.5;

    // Create intricate geometric layers using a folded space
    vec3 fp = p;
    float scale = 1.0;
    for (int i = 0; i < 3; ++i) {
        fp = abs(fp) - 0.5;
        if (fp.x < fp.y) fp.xy = fp.yx;
        if (fp.x < fp.z) fp.xz = fp.zx;
        if (fp.y < fp.z) fp.yz = fp.zy;
        fp *= 2.0;
        scale *= 2.0;
    }

    // Small computational nodes
    float nodes = (length(fp) - 1.5) / scale;
    if (nodes > 0.0 && nodes < d && max(q.x, q.y) > 2.0) {
        d = min(shaft, max(shaft + 0.1, nodes)); // embed nodes in walls
        if (d == nodes) {
            mat = 2.0;
            if (hash31(c) > 0.8) glow = 1.0; // some nodes are data cores
        }
    }

    // Giant crossing data pipelines
    vec3 pipeQ = p;
    pipeQ.z = mod(pipeQ.z, 10.0) - 5.0;
    float pipeId = floor(p.z / 10.0);

    if (hash11(pipeId) > 0.5) {
        float pipeX = length(vec2(pipeQ.y, pipeQ.z)) - 0.2;
        if (pipeX < d) { d = pipeX; mat = 3.0; glow = 2.0; } // Data stream
    } else {
        float pipeY = length(vec2(pipeQ.x, pipeQ.z)) - 0.2;
        if (pipeY < d) { d = pipeY; mat = 3.0; glow = 2.0; }
    }

    hitMat = mat;
    hitGlow = glow;

    return d;
}

vec3 calcNormal(vec3 p, float tp) {
    vec2 e = vec2(0.01, 0.0);
    return normalize(vec3(
        map(p + e.xyy, tp) - map(p - e.xyy, tp),
        map(p + e.yxy, tp) - map(p - e.yxy, tp),
        map(p + e.yyx, tp) - map(p - e.yyx, tp)
    ));
}

void main()
{
    float tp = (techP > 0.01 ? techP : 1.0);
    float dp = (dataP > 0.01 ? dataP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float drift = time * 3.0 + audioAdvance * 10.0;

    vec3 ro = vec3(0.0, 0.0, drift);

    // Subtle shifting inside the tunnel
    ro.x += sin(time * 0.5) * 0.5;
    ro.y += cos(time * 0.4) * 0.5;

    vec3 ta = ro + vec3(0.0, 0.0, 1.0);

    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);

    float roll = time * 0.2 + audioPhase * 0.1; // slow continuous roll
    vec2 ruv = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * uv;
    vec3 rd = normalize(ruv.x * uu + ruv.y * vv + 1.2 * ww);

    float d = 0.0;
    vec3 p;
    float m = 0.0;
    float g = 0.0;
    int steps = 0;

    for (int i = 0; i < 90; ++i) {
        p = ro + rd * d;
        float ds = map(p, tp);
        m = hitMat;
        g = hitGlow;
        steps = i;
        if (ds < 0.005 * (1.0 + d * 0.05)) break;
        d += ds * 0.7;
        if (d > 60.0) { m = 0.0; break; }
    }

    vec3 col = vec3(0.0);

    vec3 dataColor = imgPalette(0.8 + audioKick * 0.2); // bright data streams
    vec3 structColor = imgPalette(0.3); // ambient interior glow

    if (m > 0.5) {
        vec3 n = calcNormal(p, tp);

        // Spot light
        float dif = max(dot(n, normalize(vec3(0.0, 0.0, p.z + 5.0) - p)), 0.0);
        vec3 albedo = vec3(0.26); // dark metallic, but readable unlit

        col = albedo * (0.34 + dif * (0.7 + audioSwell * 0.5));

        // Reflections
        float spec = pow(max(dot(reflect(-normalize(ro - p), n), -rd), 0.0), 32.0);
        col += vec3(0.3) * spec;

        if (m == 2.0 && g == 1.0) {
            // Processing nodes flash frantically
            // 10 Hz Reselektion + wandernde Zellen = hektisches Springen.
            float activity = hash31(floor(p * 5.0) + floor(time * 2.00));
            float flash = smoothstep(0.85, 0.95, activity);
            col += structColor * flash * (1.0 + audioKick * 3.0) * dp;
        }
        else if (m == 3.0 && g == 2.0) {
            // Data pipelines pulse along their length
            float axisP = (abs(n.x) > 0.5) ? p.y : p.x;
            float flow = smoothstep(0.6, 0.9, sin(axisP * 10.0 - time * 7.0));
            col += dataColor * flow * (1.0 + audioKick * 2.0) * dp * (1.0 + audioSwell);
        }
        else if (m == 1.0) {
            // Circuits on the walls
            float grid = step(0.95, fract(p.z * 5.0)) + step(0.95, fract(p.x * 5.0)) + step(0.95, fract(p.y * 5.0));
            // Reselektion alle 2 s statt 2x pro Sekunde -- die "springenden
            // Streifen aussen" waren dieser Takt.
            float activeGrid = grid * step(0.9, hash21(floor(p.xy * 5.0) + floor(time * 0.5)));
            col += structColor * activeGrid * (0.5 + audioKick);
        }

        col *= clamp(1.0 - float(steps) * 0.015, 0.1, 1.0);
    }

    // Energy haze inside the Matrioshka brain
    // NOTE: this haze is weighted by exp(-d*k), i.e. strongest AT the camera,
    // which is backwards for distance fog -- but here it is what actually
    // fills and lights the interior volume. Correcting the direction measured
    // 0.009 mean luma (near-black), so it stays as an inward volume glow.
    col = mix(col, structColor * (0.24 + audioSwell * 0.2), exp(-d * 0.05));

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
