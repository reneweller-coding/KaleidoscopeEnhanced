#version 330 core
out vec4 fragColor;
/**
 * @file StarshipPlanetaryOrbit.frag
 * @brief STARSHIP PLANETARY ORBIT: a heavy cruiser holding station over a
 * living world. The planet is an analytic sphere -- oceans, continents, an
 * ice cap and a SEPARATE cloud shell above the surface that is domain-warped
 * and advected every frame, so the weather genuinely deforms rather than
 * scrolling. A soft terminator runs across it, city lights come up on the
 * night side, and the atmosphere scatters into a rim that brightens toward
 * the day/night line. The ship crosses in the foreground, lit from the same
 * sun and bounce-lit from the planet below it.
 *   audioAdvance -> orbital progress (planet spin + cloud advection)
 *   audioSwell   -> engine glow and the strength of the atmospheric rim
 *   audioKick    -> thruster flare on the cruiser
 *   audioBass    -> weather system scale (the cloud deck breathes)
 *   audioBeatPhase-> navigation strobe
 *   audioChromaHue-> ocean and atmosphere hue follow the musical key
 *
 * Per-activation variety:
 *   cloudP  float cloud deck coverage                (0.3..1.5)
 *   shipP   float how large the cruiser sits in frame(0.6..1.7)
 *   glowP   float engine / city-light intensity      (0.6..1.8)
 *   hueP    float palette offset                     (0..6.28)
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
uniform float audioBeatPhase;
uniform float audioChromaHue;

uniform float cloudP;
uniform float shipP;
uniform float glowP;
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

float noise3(vec3 p)
{
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n = i.x + i.y * 57.0 + i.z * 113.0;
    float a = mix(hash11(n +   0.0), hash11(n +   1.0), f.x);
    float b = mix(hash11(n +  57.0), hash11(n +  58.0), f.x);
    float c = mix(hash11(n + 113.0), hash11(n + 114.0), f.x);
    float d = mix(hash11(n + 170.0), hash11(n + 171.0), f.x);
    return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
}

float fbm3(vec3 p, int oct)
{
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 6; ++i) {
        if (i >= oct) break;
        s += a * noise3(p); p *= 2.02; a *= 0.5;
    }
    return s;
}

float sdBox(vec3 p, vec3 b)
{
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// Ray/sphere, returning the near hit. -1 on a miss.
float iSphere(vec3 ro, vec3 rd, float r)
{
    float b = dot(ro, rd);
    float c = dot(ro, ro) - r * r;
    float h = b * b - c;
    if (h < 0.0) return -1.0;
    return -b - sqrt(h);
}

// The cruiser, in its own space (+z bow). Silhouette only; plating is shaded.
float shipSDF(vec3 p, out float part)
{
    float tp = max(1.0 - 0.6 * smoothstep(1.5, 8.4, p.z), 0.14);
    float hull  = sdBox(p, vec3(1.55 * tp, 0.60 * tp, 8.6)) - 0.22 * tp;
    float spine = sdBox(p - vec3(0.0, 0.68, -1.6), vec3(0.55, 0.34, 5.4)) - 0.12;
    float tower = sdBox(p - vec3(0.0, 1.35, -4.1), vec3(0.72, 0.62, 1.35)) - 0.14;
    float keel  = sdBox(p - vec3(0.0, -0.72, -0.6), vec3(0.42, 0.38, 5.9)) - 0.10;
    vec3 sp = p; sp.x = abs(sp.x);
    float wing  = sdBox(sp - vec3(1.75, -0.15, -2.4), vec3(0.85, 0.16, 2.6)) - 0.10;
    float block = sdBox(p - vec3(0.0, 0.10, -8.7), vec3(1.75, 0.85, 0.75)) - 0.16;

    part = 0.0;
    float d = hull;
    if (spine < d) { d = spine; part = 1.0; }
    if (tower < d) { d = tower; part = 1.0; }
    if (keel  < d) { d = keel;  part = 0.0; }
    if (wing  < d) { d = wing;  part = 0.0; }
    if (block < d) { d = block; part = 2.0; }
    return d;
}

void main()
{
    float cld  = (cloudP > 0.01 ? cloudP : 0.9);
    float shpS = (shipP  > 0.01 ? shipP  : 1.0);
    float glw  = (glowP  > 0.01 ? glowP  : 1.0);
    float hue  = (hueP   > 0.01 ? hueP   : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // Orbital time.  Slow by design; audioAdvance supplies the musical push.
    float t = time * 0.035 + audioAdvance * 0.06;

    // Everything below is in PLANET RADII (R = 1).  The first cut used
    // R = 60 with the centre 74 units out, so the frame filled with one
    // patch of surface -- no limb, no weather, just a grey gradient.
    vec3 ro = vec3(0.0, 0.92, -3.05);
    float pitch = -0.16 + 0.035 * sin(t * 0.5);
    float yaw   =  0.20 * sin(t * 0.37) + t * 0.10;
    vec3 fwd = normalize(vec3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch)));
    vec3 rgt = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
    vec3 upv = cross(rgt, fwd);
    float roll = 0.05 * sin(t * 0.31);
    vec2 ruv = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * uv;
    vec3 rd = normalize(ruv.x * rgt + ruv.y * upv + 1.40 * fwd);

    // Sun: fixed in world space, so the terminator is stable.
    // Sun over the camera's shoulder: with it behind the planet the whole
    // world recorded as a dark disc with a thread of crescent.
    vec3 sun = normalize(vec3(-0.52, 0.44, -0.73));

    vec3 oceanTint = imgPalette(0.58);
    oceanTint = mix(vec3(0.06, 0.20, 0.44), oceanTint, 0.40);
    vec3 airTint = imgPalette(0.66);
    airTint = mix(vec3(0.35, 0.58, 1.0), airTint, 0.35);

    // ---------------- starfield ----------------
    vec3 col = vec3(0.004, 0.006, 0.013);
    for (int i = 0; i < 2; ++i) {
        vec3 sp = rd * (110.0 + 170.0 * float(i));
        vec3 cell = floor(sp);
        vec3 f = fract(sp) - 0.5;
        if (hash31(cell) > 0.977) {
            float b = exp(-dot(f, f) * 200.0) * (0.4 + 0.6 * hash31(cell + 5.0));
            col += mix(vec3(0.75, 0.84, 1.0), vec3(1.0, 0.9, 0.75),
                       hash31(cell + 11.0)) * b;
        }
    }

    // ---------------- planet ----------------
    const float R = 1.0;
    vec3 pc = vec3(0.0, -0.28, 0.0);         // planet centre, set low in frame
    vec3 pro = ro - pc;

    float tHit = iSphere(pro, rd, R);
    float tCloud = iSphere(pro, rd, R * 1.022);
    float planetDepth = 1e9;

    if (tHit > 0.0) {
        planetDepth = tHit;
        vec3 sp = normalize(pro + rd * tHit);           // surface normal
        float lam = dot(sp, sun);
        float day = smoothstep(-0.09, 0.20, lam);       // soft terminator

        // --- surface: continents, ocean, ice caps ---
        vec3 rot = sp;
        float spin = t * 2.4;
        rot.xz = mat2(cos(spin), -sin(spin), sin(spin), cos(spin)) * rot.xz;

        float cont = fbm3(rot * 2.3, 5);
        float land = smoothstep(0.50, 0.58, cont);
        float shore = smoothstep(0.47, 0.52, cont) * (1.0 - land);

        vec3 landCol = mix(vec3(0.16, 0.22, 0.10), vec3(0.34, 0.30, 0.18),
                           fbm3(rot * 7.0, 4));
        vec3 surf = mix(oceanTint, landCol, land);
        surf = mix(surf, vec3(0.35, 0.55, 0.62), shore * 0.7);

        // Ice caps, blended by latitude.
        float ice = smoothstep(0.72, 0.88, abs(sp.y));
        surf = mix(surf, vec3(0.86, 0.90, 0.95), ice);

        // Specular glint off the water only.
        vec3 h = normalize(sun - rd);
        float spec = pow(max(dot(sp, h), 0.0), 90.0) * (1.0 - land) * (1.0 - ice);

        vec3 pcol = surf * (0.06 + 1.05 * max(lam, 0.0)) * day;
        pcol += vec3(1.0, 0.95, 0.85) * spec * 1.6 * day;

        // --- night side: city lights on land, and only on land ---
        float night = 1.0 - day;
        float cityMask = land * smoothstep(0.55, 0.80, fbm3(rot * 12.0, 4));
        pcol += vec3(1.0, 0.80, 0.45) * cityMask * night
              * (0.55 + 0.35 * audioLevel) * glw;
        pcol += oceanTint * night * 0.020;                 // faint earthshine

        col = pcol;
    }

    // --- the cloud shell: a SEPARATE sphere above the surface, domain-warped
    //     and advected, so the weather deforms instead of scrolling past ---
    if (tCloud > 0.0 && tCloud < planetDepth + 1.0) {
        vec3 cp = normalize(pro + rd * tCloud);
        float lam = dot(cp, sun);
        float day = smoothstep(-0.12, 0.22, lam);

        vec3 crot = cp;
        float cspin = t * 2.4 + 0.10 * audioAdvance;
        crot.xz = mat2(cos(cspin), -sin(cspin), sin(cspin), cos(cspin)) * crot.xz;

        // Two-stage domain warp: the second fbm is displaced by the first,
        // and BOTH drift -- that is what makes the systems curl and shear
        // over time rather than translate rigidly.
        float sc = 3.1 * (1.0 + 0.10 * audioBass);
        vec3 w1 = vec3(fbm3(crot * sc * 0.7 + 11.0, 4),
                       fbm3(crot * sc * 0.7 + 23.0, 4),
                       fbm3(crot * sc * 0.7 + 37.0, 4)) - 0.5;
        float cf = fbm3(crot * sc + w1 * (1.9 + 0.5 * sin(t * 0.7)), 5);

        // Banding: weather organises into latitude belts on a spinning world.
        float band = 0.5 + 0.5 * sin(cp.y * 9.0 + w1.x * 2.4);
        cf = mix(cf, cf * 0.75 + 0.25 * band, 0.35);

        float cover = smoothstep(0.52 - 0.12 * cld, 0.70, cf) * clamp(cld, 0.0, 1.6);
        // Fade the shell at the limb so it does not draw a hard ring.
        float limb = smoothstep(0.0, 0.25, dot(cp, -rd));
        cover *= limb;

        vec3 cloudLit = mix(vec3(0.55, 0.60, 0.70), vec3(1.0, 0.98, 0.95),
                            smoothstep(0.0, 0.6, lam));
        vec3 cloudCol = cloudLit * (0.10 + 1.0 * max(lam, 0.0)) * day;
        cloudCol += airTint * 0.05 * (1.0 - day);

        col = mix(col, cloudCol, clamp(cover, 0.0, 1.0));
        if (planetDepth > 1e8) planetDepth = tCloud;
    }

    // --- atmosphere: a rim that brightens toward the terminator ---
    {
        float b = dot(pro, rd);
        float c2 = dot(pro, pro) - (R * 1.10) * (R * 1.10);
        float h = b * b - c2;
        if (h > 0.0) {
            float ta = -b - sqrt(h);
            float tb = -b + sqrt(h);
            float seg = max(0.0, min(tb, planetDepth) - max(ta, 0.0));
            float dens = seg / (R * 0.42);
            vec3 mp = normalize(pro + rd * max(ta, 0.0));
            float lam = max(dot(mp, sun), 0.0);
            // Forward scattering: the limb glows most where the sun is behind it.
            float scat = pow(lam, 1.3) * (0.55 + 0.45 * audioSwell);
            col += airTint * dens * scat * 0.55;
            col += vec3(1.0, 0.72, 0.48) * dens * pow(lam, 6.0) * 0.30;   // sunset band
        }
    }

    // ---------------- the cruiser, in the foreground ----------------
    {
        // Ship space: it crosses the frame at a slight angle, ahead of us.
        float sYaw = 0.42 + 0.06 * sin(t * 0.44);
        float cs = cos(sYaw), sn = sin(sYaw);
        // The cruiser rides in the FOREGROUND: small against a world in
        // absolute terms, large in frame because it is close to the lens.
        vec3 shipPos = ro + fwd * (1.18 + 0.10 * sin(t * 0.27))
                          + rgt * (-0.20 + 0.07 * sin(t * 0.51))
                          + upv * ( 0.20 + 0.05 * sin(t * 0.39));
        float k = 0.050 * max(shpS, 0.3);     // ship size in planet radii
        float sScale = 1.0 / k;

        vec3 lro = (ro - shipPos) * sScale;
        vec3 lrd = rd;
        lro.xz = mat2(cs, -sn, sn, cs) * lro.xz;
        lrd.xz = mat2(cs, -sn, sn, cs) * lrd.xz;

        float d = 0.0, part = 0.0, hitPart = -1.0;
        vec3 hp = vec3(0.0);
        int steps = 0;
        for (int i = 0; i < 80; ++i) {
            vec3 p = lro + lrd * d;
            float ds = shipSDF(p, part);
            steps = i;
            if (ds < 0.006 * (1.0 + d * 0.2)) { hitPart = part; hp = p; break; }
            d += ds * 0.82;
            if (d > 120.0) break;
        }

        if (hitPart >= 0.0 && d / sScale < planetDepth) {
            vec2 e = vec2(0.010, 0.0);
            float u;
            vec3 n = normalize(vec3(
                shipSDF(hp + e.xyy, u) - shipSDF(hp - e.xyy, u),
                shipSDF(hp + e.yxy, u) - shipSDF(hp - e.yxy, u),
                shipSDF(hp + e.yyx, u) - shipSDF(hp - e.yyx, u)));

            vec3 lsun = sun;
            lsun.xz = mat2(cs, -sn, sn, cs) * lsun.xz;
            float dif = max(dot(n, lsun), 0.0);
            float fres = pow(1.0 - max(dot(n, -lrd), 0.0), 4.0);

            // Plating, as on CapitalShipCruise: seams and per-plate tone.
            vec2 plate = (abs(n.y) > 0.55) ? hp.xz : ((abs(n.x) > 0.55) ? hp.zy : hp.xy);
            vec2 g1 = abs(fract(plate * 1.4) - 0.5);
            float seam = smoothstep(0.45, 0.50, max(g1.x, g1.y));
            float tone = 0.80 + 0.30 * hash21(floor(plate * 1.4));
            vec3 albedo = vec3(0.42, 0.45, 0.50) * tone * (1.0 - 0.40 * seam);

            vec3 scol = albedo * (0.20 + 1.65 * dif);
            // Planet bounce: the world below throws light up onto the hull.
            float upFace = max(-n.y, 0.0);
            scol += mix(oceanTint, airTint, 0.5) * albedo * upFace * 0.55;
            scol += vec3(0.7, 0.82, 1.0) * fres * 0.28;
            scol *= clamp(1.0 - float(steps) * 0.007, 0.4, 1.0);

            // Windows on the spine/tower.
            if (hitPart > 0.5 && hitPart < 1.5) {
                vec2 wc = floor(vec2(hp.z * 3.4, hp.y * 4.6));
                vec2 wf = fract(vec2(hp.z * 3.4, hp.y * 4.6));
                float lit = step(0.60, hash21(wc + 2.7));
                float win = lit * step(0.25, wf.x) * step(wf.x, 0.75)
                                * step(0.32, wf.y) * step(wf.y, 0.68);
                scol += vec3(1.0, 0.92, 0.72) * win * 0.75 * glw;
            }
            // Engine block: emissive.
            if (hitPart > 1.5) {
                float r = length(hp.xy - vec2(0.0, 0.10)) / 1.7;
                float core = pow(clamp(1.0 - r, 0.0, 1.0), 1.5);
                scol += mix(vec3(0.30, 0.70, 1.0), vec3(0.9, 0.96, 1.0), core)
                      * core * (1.0 + 1.4 * audioSwell + 1.7 * audioKick) * glw;
            }
            // Navigation strobe.
            float strobe = pow(max(0.0, 1.0 - abs(fract(audioBeatPhase) - 0.05) * 10.0), 3.0);
            float atTop = smoothstep(0.85, 1.15, hp.y);
            scol += vec3(1.0, 0.32, 0.28) * atTop * strobe * 0.8 * glw;

            col = scol;
        }
    }

    if (hue > 0.001) col = hueRot(col, 0.20 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.40 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
