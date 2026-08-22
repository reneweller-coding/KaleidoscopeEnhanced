#version 330 core
out vec4 fragColor;
/**
 * @file NewtonBasinPsychedelicSea.frag
 * @brief NEWTON BASIN PSYCHEDELIC SEA: Higher-order complex Newton-Raphson
 * root attraction basins with 3D embossed normal relief, fluid relaxation
 * currents, specular wave glints, and dynamic polynomial coefficient rotation.
 *
 * Audio Reactivity:
 *   audioAdvance -> rotates complex polynomial roots & drives wave relaxation
 *   audioKick    -> flashes root convergence singularities & shockwave pulse
 *   audioCentroid-> selects polynomial degree power & fine basin ridges
 *   audioSubBass -> expands ocean basin wave amplitude
 *   audioChromaHue-> rotates the iridescent sea sunset palette
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
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;
uniform float audioChromaHue;

// Per-activation variety
uniform float speedP;
uniform float powerP;
uniform float reliefP;
uniform float glowP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t) {
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853 + hueP;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

// Overall level of the photo currently bound, from a fixed 5-tap grid. The
// basin colour is entirely photo-derived and the library spans near-black to
// near-white, so a bright photo left the sea glints and boundary lines no
// headroom. The probe rides the tex0/tex1 crossfade so the gain can never
// pop, and one number for the whole frame rescales exposure without touching
// local contrast.
float photoLevel() {
    vec3 s = img(vec2(0.25, 0.25)) + img(vec2(0.75, 0.25))
           + img(vec2(0.25, 0.75)) + img(vec2(0.75, 0.75))
           + img(vec2(0.50, 0.50));
    return dot(s * 0.2, vec3(0.299, 0.587, 0.114));
}

// Complex arithmetic helpers
vec2 cMul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 cDiv(vec2 a, vec2 b) { return vec2(dot(a, b), a.y * b.x - a.x * b.y) / max(1e-6, dot(b, b)); }

vec2 cPow(vec2 z, int n) {
    vec2 res = vec2(1.0, 0.0);
    for (int i = 0; i < 7; i++) {
        if (i >= n) break;
        res = cMul(res, z);
    }
    return res;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float rel = (reliefP > 0.01) ? reliefP : 1.2;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.28 * spd;

    // Polynomial power (3 to 6)
    int nPower = int(clamp(3.0 + floor(powerP * 2.0 + audioCentroid * 2.0), 3.0, 6.0));

    // Dynamic constant offset c = c_r + i * c_i
    vec2 cConst = vec2(
        1.0 + 0.3 * sin(t * 0.4),
        0.3 * cos(t * 0.35 + audioFlux)
    );

    // Initial complex coordinate with zoom & rotation
    float zoom = 1.45 + 0.25 * sin(audioSwell * 2.0);
    float rotA = t * 0.12;
    float cs = cos(rotA), sn = sin(rotA);
    vec2 z = mat2(cs, -sn, sn, cs) * uv * zoom;

    float iterCount = 0.0;

    // Newton-Raphson iteration: z -> z - (z^n - c) / (n * z^(n-1))
    for (int i = 0; i < 22; i++) {
        vec2 zn = cPow(z, nPower);
        vec2 zn_minus_1 = cPow(z, nPower - 1);

        vec2 fz = zn - cConst;
        vec2 dfz = float(nPower) * zn_minus_1;

        vec2 stepZ = cDiv(fz, dfz);
        z -= stepZ;

        float stepLen = dot(stepZ, stepZ);
        if (stepLen < 0.0001) {
            iterCount = float(i);
            break;
        }

        iterCount += 1.0;
    }

    // Determine root angle sector
    float rootAngle = atan(z.y, z.x);
    float rootSector = (rootAngle + 3.14159265) / (6.2831853 / float(nPower));

    // 3D Embossed surface normal estimation based on iteration gradient
    float eps = 0.005;
    vec2 zDx = uv + vec2(eps, 0.0);
    vec2 zDy = uv + vec2(0.0, eps);
    // The sin() term is the sea swell riding on the iteration terrain; sub-bass
    // scales its amplitude only (never its phase), so heavy lows deepen the
    // wave relief that the normal -- and therefore the glints -- are built from.
    float waveAmp = 1.0 + 0.5 * audioSubBass;
    float hCenter = iterCount + waveAmp * sin(rootAngle * float(nPower) * 2.0 + t);
    float hDx = iterCount + waveAmp * sin(atan(zDx.y, zDx.x) * float(nPower) * 2.0 + t);
    float hDy = iterCount + waveAmp * sin(atan(zDy.y, zDy.x) * float(nPower) * 2.0 + t);

    vec3 normal = normalize(vec3((hDx - hCenter) * rel, (hDy - hCenter) * rel, eps * 3.0));
    vec3 lightDir = normalize(vec3(cos(t * 0.5), sin(t * 0.5), 1.2));

    // Lighting: Diffuse + Specular sea glints
    float diff = max(0.0, dot(normal, lightDir));
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    vec3 halfVec = normalize(lightDir + viewDir);
    float spec = pow(max(0.0, dot(normal, halfVec)), 24.0) * (1.0 + 2.0 * audioKick);

    // Dynamic texture sample mapped to converged root basin
    vec2 sampleUV = fract(z * 0.4 + 0.5);
    vec3 texCol = img(sampleUV);

    // Multi-attractor psychedelic coloring
    vec3 palA = imgPalette(rootSector / float(nPower) + iterCount * 0.05);
    vec3 palB = imgPalette(rootSector / float(nPower) + 0.5);
    vec3 basinCol = mix(palA, palB, 0.5 + 0.5 * sin(iterCount * 0.6 + t));

    basinCol = mix(basinCol, texCol, 0.35 + 0.15 * audioValence);

    // Hold the sea surface to a fixed level so the relief, the glints and the
    // basin boundaries are what carries the light, whatever photo is bound.
    basinCol *= clamp(0.32 / max(0.05, photoLevel()), 0.20, 2.4);

    // Glowing root boundary lines. The old metric was min(stepLen) fed into
    // exp(-d * 50) -- but Newton converges QUADRATICALLY, so every pixel's
    // smallest step is ~1e-4..1e-2 and that exponential evaluated to ~0.9
    // across the entire frame: an unbroken magenta flood that clipped the
    // basin interiors to white and left the boundaries (which converge
    // slowly, i.e. large steps) as the only DARK part of the picture -- the
    // exact inverse of the intent. A basin boundary is where convergence is
    // slow, so key the glow off the iteration count instead.
    float convergeSlow = clamp(iterCount / 22.0, 0.0, 1.0);
    float rootEdgeGlow = smoothstep(0.45, 1.0, convergeSlow) * glw;

    basinCol = basinCol * (0.25 + 0.75 * diff)
             + min(vec3(1.2, 1.3, 1.5) * spec, vec3(1.15));
    basinCol += min(vec3(1.4, 0.9, 1.6) * rootEdgeGlow * (1.0 + 2.5 * audioKick), vec3(1.25));

    basinCol = pow(basinCol, vec3(0.87));
    vec3 _catTone = clamp(basinCol, 0.0, 1.0);
    _catTone /= 1.0 + 0.28 * max(_catTone.r, max(_catTone.g, _catTone.b));
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));   // peak knee round 2
    float _nbLum = dot(_catTone, vec3(0.299, 0.587, 0.114));
    _catTone = clamp(mix(vec3(_nbLum), _catTone, 1.35), 0.0, 1.0);
    fragColor = vec4(_catTone, 1.0);
}
