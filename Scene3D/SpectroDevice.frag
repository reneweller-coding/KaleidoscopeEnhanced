#version 330 core
out vec4 fragColor;
/**
 * @file SpectroDevice.frag
 * @brief GEOM="MESH" FAMILY: a real hi-fi prop (boombox, turntable, modular
 * synth, jukebox, tube radio, tape deck) turning on a showroom turntable in
 * front of a synthwave grid horizon -- and the device's own front panel is a
 * LIVE display of the music, read straight out of the engine's spectrogram
 * ring (texSpectro, unit 28; declaring the sampler is the whole opt-in, see
 * EffectShader::usesSpectro()). The visualizer's own signal ends up rendered
 * on an object inside the visualizer.
 *
 * The bars are built in OBJECT space (vLocalPos), not screen or world space,
 * so they stay painted on the device as it turns instead of sliding across
 * it like a projection. vObjNormal picks out the flat front panel: TRELLIS
 * builds every mesh from a front-on concept image, so the panel facing the
 * original camera is reliably the mesh's own +Z.
 *   texSpectro   -> the bars themselves (x = frequency, y = time/history)
 *   audioKick    -> bar flash + a bob (vertex stage)
 *   audioSwell   -> key light, grid brightness
 *   audioAdvance -> turntable rate (vertex stage), horizon scroll
 *
 * Per-instance: sizeP (relative scale), spinP (turntable rate),
 *               barP (display brightness).
 * Per-activation variety: hueP float palette offset (0..6.28).
 */

uniform sampler2DArray texMeshMaterial;
uniform int texMeshMaterialLayers;

uniform sampler2D texSpectro;   // 32 log-spaced bands across, ~20 s of history down (ring)
uniform float spectroHead;      // T coordinate of "now", continuous
uniform float spectroFill;

uniform float time;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;

uniform float hueP;
uniform float barP;

in vec2  vUV;
in vec3  vNormal;
in vec3  vPos;
in vec3  vLocalPos;
in vec3  vObjNormal;
in float vBg;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

float hash13(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

// ---- Sky shell: a synthwave horizon. The grid is a real ray-plane
// intersection against y = -1 rather than a screen-space pattern, so it
// keeps true perspective convergence as the camera sweeps. ----
vec3 renderSky(vec3 dir)
{
    vec3 col;
    if (dir.y < -0.015)
    {
        float t = -1.0 / dir.y;             // distance to the ground plane
        vec2 g = dir.xz * t;
        g.y += time * 0.8 + audioAdvance * 0.4;   // scroll toward the viewer
        vec2 cell = abs(fract(g) - 0.5);
        float line = 1.0 - smoothstep(0.0, 0.045, min(cell.x, cell.y));
        float fade = exp(-t * 0.055);       // horizon haze
        col = vec3(0.02, 0.01, 0.05) * fade;
        col += vec3(0.95, 0.15, 0.75) * line * fade * (0.7 + 0.6 * audioSwell);
    }
    else
    {
        // Sky: a vertical gradient, a banded sun, and a few stars up high.
        float h = clamp(dir.y, 0.0, 1.0);
        col = mix(vec3(0.34, 0.06, 0.30), vec3(0.03, 0.02, 0.12), pow(h, 0.6));
        vec3 sunDir = normalize(vec3(0.0, 0.16, 1.0));
        float d = distance(normalize(dir), sunDir);
        float disc = 1.0 - smoothstep(0.16, 0.175, d);
        // The classic horizontal cuts: wider apart toward the top of the disc.
        float band = step(0.35, fract(dir.y * 42.0));
        float cut = mix(1.0, band, smoothstep(0.02, 0.20, dir.y));
        col = mix(col, mix(vec3(1.0, 0.85, 0.25), vec3(1.0, 0.20, 0.55), h * 3.2), disc * cut);
        col += vec3(1.0) * step(0.9975, hash13(floor(dir * 420.0))) * smoothstep(0.15, 0.5, h);
    }
    return col;
}

void main()
{
    if (vBg > 0.5)
    {
        fragColor = vec4(renderSky(normalize(vPos)), 1.0);
        return;
    }

    float hue = (hueP > 0.01 ? hueP : 0.0);
    float bp  = (barP > 0.01 ? barP : 1.0);

    vec4 base = texture(texMeshMaterial, vec3(vUV, 0.0));
    if (base.a < 0.1) discard;
    float roughness = 0.5, metallic = 0.3;
    if (texMeshMaterialLayers >= 2)
    {
        vec4 mr = texture(texMeshMaterial, vec3(vUV, 1.0));
        roughness = mr.g;
        metallic  = mr.b;
    }

    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(-vPos);

    // Warm key from the sun side, cool magenta bounce from the grid below --
    // the prop should look lit BY the scene it stands in.
    vec3 lightDir = normalize(vec3(0.15, 0.5, -0.7));
    float diff = max(dot(n, lightDir), 0.0);
    float bounce = max(-n.y, 0.0);
    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(n, halfV), 0.0), mix(48.0, 8.0, roughness));
    vec3 specColor = mix(vec3(1.0, 0.93, 0.82), base.rgb, metallic);

    vec3 col = base.rgb * (0.42 + diff * (1.25 + 0.45 * audioSwell));
    col += base.rgb * vec3(0.9, 0.2, 0.7) * bounce * 0.5;
    col += specColor * spec * (0.5 + 0.6 * (1.0 - roughness));

    // ---- the live display ----
    // Object space is roughly [-0.5,0.5] on the mesh's longest axis (measured
    // across this generator's whole output), so shifting by 0.5 lands the
    // panel in [0,1] without needing per-model calibration.
    vec2 panel = vLocalPos.xy + vec2(0.5);
    // Which surfaces count as "the front panel". Kept fairly permissive:
    // these meshes are photogrammetry-style output, so a panel that reads as
    // flat to the eye still has normals wandering a fair way off +Z, and a
    // tight mask left the display showing on almost nothing.
    float front = smoothstep(0.35, 0.75, abs(normalize(vObjNormal + 1e-6).z));
    if (front > 0.001 && panel.x > 0.02 && panel.x < 0.98 && panel.y > 0.02 && panel.y < 0.98)
    {
        // Thin gaps between bars so it reads as a segmented display, not a
        // smooth graph. 24 columns is close to the ring's own 32 bands
        // without aliasing against them.
        float col24 = floor(panel.x * 24.0) / 24.0;
        float gap = smoothstep(0.06, 0.16, abs(fract(panel.x * 24.0) - 0.5) * 2.0 - 0.15);
        float energy = texture(texSpectro, vec2(col24, fract(spectroHead))).r;
        energy = clamp(energy * 1.35, 0.0, 1.0) * min(spectroFill * 4.0, 1.0);

        float lit = step(panel.y, energy) * gap * front;
        // Green through amber to red as the bar climbs, like a real VU meter.
        vec3 barCol = mix(vec3(0.15, 1.0, 0.35), vec3(1.0, 0.75, 0.1), smoothstep(0.35, 0.7, panel.y));
        barCol = mix(barCol, vec3(1.0, 0.15, 0.1), smoothstep(0.72, 0.9, panel.y));
        col += barCol * lit * bp * (1.5 + 1.6 * audioKick);

        // A dim trace of the history above the live bar, so quiet passages
        // still have something moving on the panel.
        float ageEnergy = texture(texSpectro, vec2(col24, fract(spectroHead - panel.y * 0.22))).r;
        col += vec3(0.1, 0.5, 0.6) * ageEnergy * gap * front * 0.28 * bp;
    }

    // Neon rim picked up from the grid.
    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
    col += vec3(0.9, 0.25, 0.8) * fresnel * (0.15 + 0.3 * audioSwell);

    if (hue > 0.001) col = hueRot(col, 0.15 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
