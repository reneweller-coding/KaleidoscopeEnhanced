#version 330 core
out vec4 fragColor;
/**
 * @file DysonSphereCollapse.frag
 * @brief DYSON SPHERE COLLAPSE: A massive metal shell completely encasing a star
 * is suffering a catastrophic structural failure. The enraged star's plasma
 * bursts violently through the shattering metal plates, tearing the megastructure
 * apart in sync with the audio.
 *   audioAdvance -> slow rotation/drift of the crumbling sphere
 *   audioKick    -> massive plasma eruptions blowing off armor plates
 *   audioSwell   -> blinding internal brightness of the trapped star
 *   audioChromaHue-> palette offset for the escaping stellar plasma
 *
 * Per-activation variety:
 *   damageP float extent of the structural damage (0.5..1.5)
 *   flareP float intensity of the escaping plasma (0.5..2.0)
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

uniform float damageP;
uniform float flareP;
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
    float dp = (damageP > 0.01 ? damageP : 1.0);
    float fp = (flareP > 0.01 ? flareP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    vec3 col = vec3(0.0);

    vec3 metalCol = vec3(0.30, 0.33, 0.38); // armored metal -- bright enough to read as METAL next to the glowing breaches, not as black holes
    vec3 plasmaCol = imgPalette(0.8 + audioCentroid * 0.1); // Blinding hot star
    // The palette follows the photo -- on a dark photo the star inside the
    // shell rendered BLACK, so every blown-off panel read as an ugly hole
    // ("defekte Normalen"). A star has a floor temperature: keep it hot.
    plasmaCol = max(plasmaCol, vec3(0.95, 0.52, 0.22) * 0.42);

    // We render the sphere filling most of the view
    vec2 sphereCenter = vec2(0.0);
    float sphereRad = 0.62;   // ganze Sphaere sichtbar, Korona hat Platz
    float dist = length(uv - sphereCenter);

    // Slow rotation
    float rot = time * 0.1 + audioAdvance * 0.5;
    mat2 rotM = mat2(cos(rot), -sin(rot), sin(rot), cos(rot));

    if (dist < sphereRad) {
        // Map 2D to 3D sphere
        float z = sqrt(max(0.0, sphereRad * sphereRad - dist * dist));
        vec3 p3 = vec3(uv.x, uv.y, z);

        // Apply rotation
        p3.xz = rotM * p3.xz;
        p3.yz = mat2(cos(0.3), -sin(0.3), sin(0.3), cos(0.3)) * p3.yz;

        // 1. The Metal Structure: a LAT/LON panel lattice on the sphere
        // surface. The old cubic floor(p3*8) grid cut the shell into the
        // broken-looking random chips the user reported -- panels must
        // follow the surface to read as a built megastructure.
        vec3 p3n = p3 / sphereRad;
        float lat = asin(clamp(p3n.y, -1.0, 1.0));
        float lon = atan(p3n.z, p3n.x);
        vec2 grid = vec2(lon * 3.0, lat * 3.0);   // ~19 x 9 panels
        vec2 gId = floor(grid);
        vec2 gF = fract(grid);

        float cellHash = fract(sin(dot(gId, vec2(12.9898, 78.233))) * 43758.5453);

        // Panel edges: dark seams between curved plates
        float edges = 1.0 - (smoothstep(0.0, 0.06, gF.x) * smoothstep(1.0, 0.94, gF.x)
                           * smoothstep(0.0, 0.06, gF.y) * smoothstep(1.0, 0.94, gF.y));
        float panels = 1.0 - edges;

        // Add structural ribbing (fbm) + per-panel tonal variation
        float ribbing = fbm(p3 * 20.0);
        vec3 surfaceCol = metalCol * (0.5 + ribbing * 0.35 + cellHash * 0.25);
        surfaceCol *= 0.35 + 0.65 * panels;   // dark seams

        // Lighting on the metal from ambient space
        float lightFront = 0.62 + 0.38 * z / sphereRad;
        surfaceCol *= lightFront;

        // 2. The Catastrophic Damage -- with an actual COLLAPSE ARC: a slow
        // triangle wave sweeps the blow-off threshold, so the shell visibly
        // loses more and more panels, then slowly reknits.
        float collapse = abs(fract(time * 0.02 + audioAdvance * 0.01) * 2.0 - 1.0);
        float fracture = fbm(p3 * 3.0 + time * 0.1);

        // Probability of a panel being completely blown off
        float blownOff = step(0.95 - collapse * 0.55 - dp * 0.15, cellHash + fracture * 0.35);

        // If a panel is missing or there's a deep fracture, the star shines through
        float holeMask = max(blownOff, smoothstep(0.8 - dp * 0.2, 0.9, fracture));

        if (holeMask > 0.0) {
            // Looking at the star inside
            // Deep plasma noise
            float internalPlasma = fbm(vec3(p3 * 5.0 - vec3(0.0, time * 2.0, 0.0)));

            // Brightness spikes with audio kicks
            float kickSpike = step(0.7, hash11(cellHash * 100.0 + floor(time * 1.50)));
            float intensity = 1.0 + (kickSpike * audioKick * 10.0 * fp);

            // Blinding heat
            surfaceCol = mix(surfaceCol, plasmaCol * (1.0 + internalPlasma) * intensity * (0.7 + audioSwell * 1.1), holeMask);   // was 1.0+swell*2: with the hot plasma floor the sphere washed out to near-white

            // The metal edges of the hole are melting/glowing red hot
            float meltEdge = smoothstep(0.0, 0.1, holeMask);
            surfaceCol += plasmaCol * meltEdge * 0.5 * (1.0 + audioSwell);
        }

        // Limb darkening for the sphere
        float limb = smoothstep(sphereRad, sphereRad * 0.7, dist);
        col += surfaceCol * limb;

    } else {
        // Deep space outside the sphere
        float bg = hash11(dot(floor(uv * 100.0), vec2(12.3, 45.6)));
        if (bg > 0.99) col += vec3(1.0) * (0.1 + audioSwell * 0.1);
    }

    // 3. Erupting Solar Flares escaping through the cracks
    // We project flares outwards from the center, masked by the holes in the sphere
    float angle = atan(uv.y, uv.x);

    // Create a 3D coordinate on the edge of the sphere based on angle to check if there's a hole
    vec3 edgeP3 = vec3(cos(angle) * sphereRad, sin(angle) * sphereRad, 0.0);
    edgeP3.xz = rotM * edgeP3.xz;
    edgeP3.yz = mat2(cos(0.3), -sin(0.3), sin(0.3), cos(0.3)) * edgeP3.yz;

    float edgeFracture = fbm(edgeP3 * 3.0 + time * 0.1);
    vec3 edgeICell = floor(edgeP3 * 8.0);
    float edgeCellHash = hash11(edgeICell.x * 12.3 + edgeICell.y * 45.6 + edgeICell.z * 78.9);
    float edgeBlownOff = step(0.7 - dp * 0.2, edgeCellHash + edgeFracture * 0.5);
    float edgeHoleMask = max(edgeBlownOff, smoothstep(0.8 - dp * 0.2, 0.9, edgeFracture));

    if (dist > sphereRad - 0.05 && edgeHoleMask > 0.0) {
        // A massive plasma jet escaping this hole
        // Noise for the jet shape
        float flareNoise = fbm(vec3(angle * 5.0, dist * 5.0 - time * 5.0, 0.0));

        // The flare gets weaker further out
        float flareFalloff = exp(-(dist - sphereRad) * (10.0 / fp));

        // Flash on kick
        float jetSpike = step(0.95, hash11(floor(angle * 5.0) + floor(time * 4.00)));
        float jetIntensity = 1.0 + (jetSpike * audioKick * 10.0 * fp);

        float flare = smoothstep(0.3, 0.8, flareNoise) * flareFalloff * edgeHoleMask;
        col += plasmaCol * flare * jetIntensity * (1.0 + audioSwell);
    }

    // Overwhelming glare from the failing containment
    float totalGlare = exp(-dist * 1.5);
    col += plasmaCol * totalGlare * 0.2 * (1.0 + audioSwell * 0.5) * fp * dp;

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
