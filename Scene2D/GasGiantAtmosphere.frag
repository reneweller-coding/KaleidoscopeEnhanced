#version 330 core
out vec4 fragColor;
/**
 * @file GasGiantAtmosphere.frag
 * @brief GAS GIANT ATMOSPHERE: A breathtaking flight through the thick, swirling
 * cloud bands of a massive gas giant. Immense lightning storms illuminate the
 * clouds from within during intense musical beats.
 *   audioAdvance -> camera flight speed through the clouds
 *   audioKick    -> massive lightning flashes within the storms
 *   audioSwell   -> ambient cloud illumination and density
 *   audioChromaHue-> palette offset for the gas giant's colors
 *
 * Per-activation variety:
 *   cloudP float density and thickness of the clouds (0.5..1.5)
 *   stormP float intensity of the lightning storms (0.5..2.0)
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

uniform float cloudP;
uniform float stormP;
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

float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n = i.x + i.y * 57.0 + i.z * 113.0;
    return mix(
        mix(mix(hash11(n + 0.0), hash11(n + 1.0), f.x),
            mix(hash11(n + 57.0), hash11(n + 58.0), f.x), f.y),
        mix(mix(hash11(n + 113.0), hash11(n + 114.0), f.x),
            mix(hash11(n + 170.0), hash11(n + 171.0), f.x), f.y), f.z);
}

float fbm(vec3 p) {
    float f = 0.0, a = 0.5;
    for(int i = 0; i < 5; i++) { f += a * noise(p); p *= 2.0; a *= 0.5; }
    return f;
}

void main()
{
    float cp = (cloudP > 0.01 ? cloudP : 1.0);
    float sp = (stormP > 0.01 ? stormP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float drift = time * 3.0 + audioAdvance * 10.0;

    vec3 ro = vec3(0.0, 5.0 * sin(time * 0.1), drift);
    vec3 ta = ro + vec3(0.0, 0.0, 1.0);

    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);

    float roll = 0.1 * sin(time * 0.2);
    vec2 ruv = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * uv;
    vec3 rd = normalize(ruv.x * uu + ruv.y * vv + 1.2 * ww);

    float d = 0.0;
    vec3 col = vec3(0.0);

    vec3 stormColor = vec3(0.8, 0.9, 1.0); // white-blue lightning
    vec3 colorBase1 = imgPalette(0.2);
    vec3 colorBase2 = imgPalette(0.7);

    vec3 sunDir = normalize(vec3(0.5, 0.8, 0.5));
    float sunScat = max(dot(rd, sunDir), 0.0);

    // Raymarching the clouds
    for (int i = 0; i < 60; ++i) {
        vec3 p = ro + rd * d;

        // Fluid-like domain warping for bands
        float warpX = fbm(vec3(p.z * 0.02, p.y * 0.05, time * 0.1)) * 10.0;
        vec3 np = vec3(p.x + warpX, p.y, p.z);

        // Horizontal cloud bands typical of gas giants
        float dens = fbm(np * vec3(0.05, 0.1, 0.05));
        // Add turbulent detail
        dens += fbm(np * 0.2) * 0.5;

        dens = smoothstep(0.4, 0.8, dens) * cp;

        if (dens > 0.01) {
            // Lightning storms inside the clouds
            float stormNoise = hash11(floor(p.z * 0.1 + p.x * 0.1) + floor(time * 1.33));   // was 10 Hz
            float lightning = step(0.95, stormNoise) * audioKick * 5.0 * sp;

            // Sunlight scattering
            float dif = clamp((dens - fbm(np * vec3(0.05, 0.1, 0.05) + sunDir * 0.5)), 0.0, 1.0);

            vec3 localCol = mix(colorBase1, colorBase2, smoothstep(0.0, 1.0, fbm(np * 0.1)));
            localCol *= (0.2 + dif * (1.0 + audioSwell) + sunScat * 0.5);
            localCol += stormColor * lightning * dens;

            // Fade by distance and accumulate
            float alpha = dens * 0.15;
            col += localCol * alpha * exp(-d * 0.03);
        }

        d += 1.0 + d * 0.02; // variable step size
        if (d > 80.0) break;
    }

    // Background sky (deep atmosphere)
    vec3 skyCol = mix(colorBase1 * 0.5, colorBase2 * 0.5, 0.5);
    col = mix(col, skyCol * (0.5 + audioSwell * 0.5), exp(-d * 0.03));

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
