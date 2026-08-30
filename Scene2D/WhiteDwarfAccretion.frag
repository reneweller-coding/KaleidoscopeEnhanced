#version 330 core
out vec4 fragColor;
/**
 * @file WhiteDwarfAccretion.frag
 * @brief WHITE DWARF ACCRETION: An extremely dense, hot white dwarf siphoning
 * glowing plasma from a bloated red giant companion. A swirling accretion disk
 * forms and violently pulses to the beat.
 *   audioAdvance -> rotation speed of the binary system and accretion disk
 *   audioKick    -> flares and matter striking the white dwarf
 *   audioSwell   -> brightness of the accretion disk and the red giant
 *   audioChromaHue-> palette offset for the plasma
 *
 * Per-activation variety:
 *   flowP float rate of the plasma flow (0.5..1.5)
 *   diskP float intensity and turbulence of the accretion disk (0.5..2.0)
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

uniform float flowP;
uniform float diskP;
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
    for(int i = 0; i < 4; i++) { f += a * noise(p); p *= 2.0; a *= 0.5; }
    return f;
}

void main()
{
    float fp = (flowP > 0.01 ? flowP : 1.0);
    float dp = (diskP > 0.01 ? diskP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // Orbital mechanics
    float orbitSpeed = time * 0.5 + audioAdvance * 2.0;

    // The White Dwarf is at the center
    vec2 wdPos = vec2(0.0, 0.0);

    // The Red Giant orbits the white dwarf (for the camera view)
    float rgDist = 1.2;
    vec2 rgPos = vec2(cos(orbitSpeed), sin(orbitSpeed)) * rgDist;

    vec3 col = vec3(0.0);

    vec3 rgColor = imgPalette(0.1 + audioCentroid * 0.1); // deep red/orange
    vec3 wdColor = imgPalette(0.9 + audioKick * 0.1);     // hot blue/white
    vec3 diskColor = imgPalette(0.5);                     // mix for the accretion disk

    float dWD = length(uv - wdPos);
    float dRG = length(uv - rgPos);

    // --- 1. Red Giant ---
    float rgRad = 0.5;
    float rgEdge = smoothstep(rgRad, rgRad * 0.9, dRG);

    // Texture for the red giant surface
    if (dRG < rgRad * 1.5) {
        vec3 p = vec3((uv - rgPos) * 5.0, time * 0.5);
        float surfaceNoise = fbm(p);

        vec3 localRG = rgColor * (0.5 + surfaceNoise * 0.5) * (1.0 + audioSwell * 0.5);

        // Darken edges (limb darkening)
        localRG *= smoothstep(rgRad * 1.2, 0.0, dRG);

        col += localRG * rgEdge;

        // Solar flares / atmosphere
        float atmos = exp(-(dRG - rgRad) * 10.0);
        col += rgColor * atmos * (0.5 + audioSwell);
    }

    // --- 2. Plasma Stream (Roche Lobe overflow) ---
    // The stream goes from the inner Lagrangian point (L1) towards the white dwarf, curving into the disk
    vec2 l1Pos = rgPos * 0.6; // Approximate L1 point

    // Curve the stream using polar coordinates around the WD
    vec2 polarWD = vec2(dWD, atan(uv.y, uv.x));
    float angleToRG = atan(rgPos.y, rgPos.x);

    // Determine the spiral path of the stream
    // The stream originates at angleToRG, and spirals inwards
    float streamAngle = angleToRG - (1.0 - polarWD.x) * 3.0; // arbitrary spiral function

    // Wrap angle diff
    float aDiffStream = mod(polarWD.y - streamAngle + 3.14159, 6.28318) - 3.14159;

    // The stream is only between the red giant and the disk
    float streamMask = smoothstep(rgDist, 0.2, polarWD.x);

    if (abs(aDiffStream) < 0.3 && streamMask > 0.0) {
        float streamCenter = 1.0 - abs(aDiffStream) / 0.3;

        // Flowing noise
        float flow = fbm(vec3(polarWD.x * 5.0, polarWD.y * 5.0 + time * 5.0 * fp, 0.0));

        vec3 streamCol = mix(rgColor, wdColor, 1.0 - polarWD.x);
        col += streamCol * pow(streamCenter, 3.0) * flow * streamMask * (1.0 + audioSwell * 0.5);
    }

    // --- 3. Accretion Disk ---
    float diskOuter = 0.4;
    float diskInner = 0.05;

    if (dWD < diskOuter && dWD > diskInner) {
        // Fast rotation
        float diskRot = polarWD.y - time * 5.0 * dp - audioAdvance * 10.0;

        float diskDetail = fbm(vec3(polarWD.x * 20.0, diskRot * 10.0, time));

        // Radial intensity profile
        float diskProfile = smoothstep(diskOuter, diskOuter * 0.5, dWD) * smoothstep(diskInner, diskInner * 2.0, dWD);

        // Turbulence/clumping reacting to kick
        float turbulence = smoothstep(0.4, 0.8, diskDetail);

        vec3 localDisk = mix(rgColor, wdColor, smoothstep(diskOuter, diskInner, dWD));

        col += localDisk * diskProfile * (0.5 + turbulence * 1.2) * dp * (1.0 + audioKick * 2.0);
    }

    // --- 4. White Dwarf ---
    // Tiny, but incredibly bright
    float wdCore = 0.01;
    float wdGlow = exp(-dWD * 30.0);

    col += wdColor * smoothstep(wdCore * 2.0, wdCore, dWD) * 2.0;
    col += wdColor * wdGlow * (1.0 + audioKick * 3.0);

    // Polar Jets from the White Dwarf
    // Assuming rotation axis is somewhat arbitrary, let's say it's Z-axis (pointing at us)
    // Actually, Scene2D means we see it from above or side. Let's make jets shoot up/down
    vec2 jetDir1 = vec2(-sin(orbitSpeed), cos(orbitSpeed)); // Perpendicular to orbit
    vec2 jetDir2 = -jetDir1;

    float j1 = max(0.0, dot(normalize(uv - wdPos), jetDir1));
    float j2 = max(0.0, dot(normalize(uv - wdPos), jetDir2));

    j1 = pow(j1, 150.0) * (0.005 / dWD);
    j2 = pow(j2, 150.0) * (0.005 / dWD);

    float jPulse = step(0.8, sin(dWD * 20.0 - time * 15.0));

    col += wdColor * j1 * dp * (0.5 + jPulse * audioKick * 5.0);
    col += wdColor * j2 * dp * (0.5 + jPulse * audioKick * 5.0);

    // --- 5. Background ---
    // Runde, gejitterte Sterne: ganze floor()-Zellen aufzuhellen ergibt
    // QUADRATE (der wiederholt gemeldete "Riesenpixel"-Fehler).
    vec2 sgrid = uv * 55.0;
    vec2 sid = floor(sgrid);
    vec2 sfr = fract(sgrid) - 0.5;
    float sh = fract(sin(dot(sid, vec2(12.9898, 78.233))) * 43758.5453);
    if (sh > 0.90) {
        vec2 spos = (vec2(fract(sh * 7.31), fract(sh * 13.7)) - 0.5) * 0.8;
        float sd2 = dot(sfr - spos, sfr - spos);
        float stw = 0.7 + 0.3 * sin(time * (1.0 + 2.0 * fract(sh * 29.0)) + sh * 40.0);
        col += vec3(1.0) * exp(-sd2 * 250.0) * stw * (0.35 + audioSwell * 0.25);
    }

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
