#version 330 core
out vec4 fragColor;
/**
 * @file GasGiantCloudCity.frag
 * @brief GAS GIANT CLOUD CITY: Floating, sleek megastructures drifting deep
 * within the incredibly thick, turbulent atmosphere of a gas giant. Massive
 * lightning storms illuminate the dense clouds from within, syncing to the beat.
 *   audioAdvance -> flight speed through the heavy clouds
 *   audioKick    -> massive lightning flashes in the clouds
 *   audioSwell   -> ambient glow of the floating city structures
 *   audioChromaHue-> palette offset for the gas giant clouds
 *
 * Per-activation variety:
 *   cloudP float turbulence and thickness of the clouds (0.5..1.5)
 *   cityP float density/brightness of the floating structures (0.5..2.0)
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
uniform float cityP;
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
    float cy = (cityP > 0.01 ? cityP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // We are flying through a thick atmosphere (no stars, just clouds)
    // Map uv to a perspective view facing forwards
    float drift = time * 2.0 + audioAdvance * 5.0;

    // Y is up/down in the atmosphere, X is sideways, Z is forwards
    // The clouds are organized in massive horizontal bands

    vec3 col = vec3(0.0);
    // Helligkeits-Floor: auf dunklen Fotos war die reine Palette schwarz
    // und die ganze Szene blieb es mit ("bleibt schwarz").
    vec3 cloudColor = max(imgPalette(0.3), vec3(0.14, 0.11, 0.08));
    vec3 lightningColor = max(imgPalette(0.8 + audioCentroid * 0.1), vec3(0.65, 0.6, 0.5));
    vec3 cityColor = max(imgPalette(0.5), vec3(0.30, 0.24, 0.14));

    // 1. Thick Volumetric Clouds
    // We use a simplified raymarch/layering for speed

    float totalDensity = 0.0;
    vec3 atmosCol = vec3(0.0);

    for(int i = 0; i < 5; ++i) {
        float z = 1.0 + float(i) * 0.5; // distance of layer
        vec2 pUv = uv * z;
        pUv.y += sin(time * 0.1) * 0.1; // slow bobbing

        // Parallax movement
        float layerDrift = drift / z;

        // Massive cloud bands
        vec3 p3 = vec3(pUv.x, pUv.y * 5.0 * cp, layerDrift);
        float clouds = fbm(p3);

        // Add turbulent swirls
        clouds = fbm(p3 + fbm(p3 * 2.0));

        float density = smoothstep(0.3, 0.7, clouds);

        // Lightning deep in the clouds
        // Triggers randomly but heavily influenced by audioKick
        float flashTrigger = step(0.9, hash11(floor(p3.x * 2.0) + floor(p3.z * 0.5) + floor(time * 4.00)));
        float flash = flashTrigger * audioKick * 5.0 * density;

        // Add color
        float alpha = density * 0.4;
        vec3 layerCol = mix(cloudColor * (0.4 + audioSwell * 0.35), lightningColor, flash);

        atmosCol += layerCol * alpha * (1.0 - totalDensity);
        totalDensity += alpha;

        if (totalDensity > 0.95) break;
    }

    col = atmosCol;

    // 2. Floating City Structures
    // Sleek, dark geometric shapes floating in the foreground and midground
    // They pass by occasionally

    float structDrift = drift * 1.5;
    vec2 structUv = uv * 2.0;

    // Grid for placing structures
    float gridX = floor(structUv.x * 2.0 + structDrift * 0.5);
    float gridZ = floor(structDrift); // using time as depth progression

    float structHash = hash11(gridX * 12.3 + gridZ * 45.6);

    if (structHash > (1.0 - 0.2 * cy)) { // Probability of a structure
        // Local coordinates within the cell
        vec2 localUv = fract(vec2(structUv.x * 2.0 + structDrift * 0.5, structUv.y + structHash));
        localUv = localUv * 2.0 - 1.0;

        // Shape of the floating structure (aerodynamic/sleek)
        float d = length(vec2(localUv.x, localUv.y * 5.0)); // stretched vertically

        if (d < 0.3) {
            vec3 sCol = vec3(0.05); // dark hull

            // Neon strips/windows
            float windows = step(0.8, sin(localUv.y * 100.0));
            float edgeLight = smoothstep(0.25, 0.3, d);

            sCol = mix(sCol, cityColor * (1.0 + audioSwell), windows * (1.0 - edgeLight) * cy);

            // Atmospheric fog over the structure based on its "depth"
            // The structure is in front, so minimal fog, but edges fade into clouds
            float fog = smoothstep(0.2, 0.3, d);

            col = mix(sCol, col, fog);
        }
    }

    // 3. Fast passing wisps of gas (very close to camera)
    float wisps = fbm(vec3(uv * 10.0, drift * 3.0));
    col = mix(col, cloudColor * (0.7 + audioSwell), smoothstep(0.35, 0.75, wisps) * 0.55);

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
