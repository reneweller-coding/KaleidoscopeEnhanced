#version 330 core
out vec4 fragColor;
/**
 * @file SpaceElevatorTransit.frag
 * @brief SPACE ELEVATOR TRANSIT: A high-speed ascent up a colossal space elevator
 * tether. The camera looks out from a glass transit pod, watching the glowing
 * planetary surface curve away below while massive orbital structures loom above.
 *   audioAdvance -> ascent speed of the elevator pod
 *   audioKick    -> flashes from passing structural rings and transit lights
 *   audioSwell   -> brightness of the planet's city lights below
 *   audioChromaHue-> palette offset for the elevator's neon lighting
 *
 * Per-activation variety:
 *   speedP float perceived speed of the transit (0.5..2.0)
 *   cityP float density and brightness of the planet below (0.5..1.5)
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

uniform float speedP;
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
    for(int i = 0; i < 4; i++) { f += a * noise(p); p *= 2.0; a *= 0.5; }
    return f;
}

void main()
{
    float sp = (speedP > 0.01 ? speedP : 1.0);
    float cp = (cityP > 0.01 ? cityP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // We are looking downwards towards the planet surface while traveling UP the tether (Z axis)
    // Actually, looking slightly angled: Y is up/down the tether, X is side, Z is out window

    vec3 col = vec3(0.0);

    vec3 cityColor = imgPalette(0.8 + audioCentroid * 0.1); // Warm city lights
    vec3 structColor = imgPalette(0.2); // Cold metal of the elevator
    vec3 neonColor = imgPalette(0.5); // Elevator interior/exterior lights

    float transitSpeed = time * 5.0 * sp + audioAdvance * 10.0 * sp;

    // 1. The Planet Below
    // The planet is a massive sphere taking up the lower portion of the view
    // We approximate it with a large circle, but moving slightly away
    vec2 planetCenter = vec2(0.0, -1.5);
    float planetRadius = 1.4;
    float distToPlanet = length(uv - planetCenter);

    if (distToPlanet < planetRadius) {
        // Surface
        vec2 pUv = (uv - planetCenter) * 2.0;

        // City light grid
        // We project it onto a sphere-like surface
        float sphereZ = sqrt(max(0.0, 1.0 - dot(pUv, pUv)));
        vec3 sphereNorm = vec3(pUv, sphereZ);

        // Parallax effect as we move up
        vec3 projP = sphereNorm * 5.0;
        projP.y -= time * 0.2; // Slow rotation of the planet

        float cityDetail = fbm(projP * 10.0);
        float grid = step(0.8, sin(projP.x * 50.0)) * step(0.8, sin(projP.y * 50.0));

        float lights = cityDetail * grid * cp;

        // Atmospheric scattering (limb darkening/brightening)
        float atmos = smoothstep(0.8, 1.0, length(pUv));

        vec3 surfaceCol = cityColor * lights * (0.2 + audioSwell * 0.8);
        surfaceCol = mix(surfaceCol, vec3(0.1, 0.2, 0.5) * (0.5 + audioSwell), atmos); // blueish atmosphere edge

        col += surfaceCol;
    } else {
        // Atmospheric halo
        float halo = exp(-(distToPlanet - planetRadius) * 20.0);
        col += vec3(0.1, 0.2, 0.5) * halo * (0.5 + audioSwell);

        // Deep space background
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
            col += vec3(1.0) * exp(-sd2 * 250.0) * stw * (0.40 + audioSwell * 0.3);
        }
    }

    // 2. The Elevator Tether and passing structures
    // The tether is a massive vertical pillar just outside the window (maybe off to the side)
    float tetherX = -0.68;
    float tetherWidth = 0.13;
    float distToTether = abs(uv.x - tetherX);

    if (distToTether < tetherWidth) {
        // We are looking at the central pillar sliding down incredibly fast
        float slideY = uv.y * 4.0 + transitSpeed;   // was *10: structure blurred into a smear

        // Horizontal structural rings passing by
        float rings = step(0.9, fract(slideY * 0.5));
        float panels = fbm(vec3(uv.x * 50.0, slideY, 0.0));
        
        vec3 localTether = mix(max(structColor, vec3(0.22)) * 0.5, max(structColor, vec3(0.22)), panels);
        
        // Cylindrical shading: cos() is symmetric about the tether axis --
        // the old sin() went NEGATIVE on the left half and blacked it out.
        float cylinderShade = cos((uv.x - tetherX) / tetherWidth * 1.57);
        localTether *= (0.40 + 0.60 * max(cylinderShade, 0.0));
        // Structural rings (computed before, never drawn).
        localTether = mix(localTether, max(structColor, vec3(0.3)) * 1.5, rings * 0.6);
        // A passing elevator car: a bright pod sliding along the tether.
        float carPhase = fract(transitSpeed * 0.03);
        float car = exp(-pow((uv.y - (carPhase * 2.4 - 1.2)) * 6.0, 2.0));
        localTether += neonColor * car * (1.2 + audioKick * 1.5);

        // Neon tracking lights sliding past
        float trackLight = step(0.98, fract(slideY * 0.1)) * step(tetherWidth * 0.8, distToTether);
        localTether += neonColor * trackLight * (2.0 + audioKick * 5.0);

        // Add passing support beams overlapping the tether
        float beam = step(0.95, fract(slideY * 0.05));
        localTether = mix(localTether, structColor * 0.2, beam);

        col = localTether;
    }

    // 3. Interior of our transit pod (framing the view)
    // Frame at the top and right
    float frameTop = smoothstep(0.45, 0.5, uv.y);
    float frameRight = smoothstep(0.7, 0.8, uv.x);
    float frameLeft = smoothstep(-0.8, -0.9, uv.x);
    float frame = max(frameTop, max(frameRight, frameLeft));

    if (frame > 0.0) {
        vec3 frameCol = structColor * 0.1; // dark interior

        // Reflection of neon lights on the glass
        float reflection = step(0.98, fract((uv.y * 10.0 + transitSpeed) * 0.1)) * (1.0 - frame);
        col += neonColor * reflection * 0.5 * (1.0 + audioKick);

        // Mix frame
        col = mix(col, frameCol, frame);
    }

    // Speed lines (optical illusion of high speed particles/dust outside the window)
    float speedDust = hash11(dot(floor(vec2(uv.x * 50.0, uv.y * 10.0 + transitSpeed * 2.0)), vec2(1.2, 3.4)));
    if (speedDust > 0.99 && frame == 0.0) {
        col += vec3(1.0) * (0.5 + audioKick);
    }

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
