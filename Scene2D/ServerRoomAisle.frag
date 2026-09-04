#version 330 core
out vec4 fragColor;
/**
 * @file ServerRoomAisle.frag
 * @brief SERVER ROOM AISLE: a cold aisle between two rack rows, in
 * perspective toward a vanishing point.  Every rack unit carries a column
 * of status LEDs driven by the spectrum bands, the cable trays run
 * overhead, and the floor tiles carry the reflection.  A slow walk down
 * the aisle on the scene clock; the swell is the cold fog rolling out of
 * the perforated tiles, the kick a fault LED going amber somewhere in the
 * row.  The photo is the rack labelling and the door glass at the end.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> LED columns, one band per rack unit (light)
 *   sceneAdvance      -> the walk and the fog (continuous)
 *   audioSwell        -> fog density (slow)
 *   audioKick         -> a fault LED, local (light)
 *   audioHigh         -> the fine blink of activity lights (light)
 *
 * Per-activation variety: racksP, fogP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioSwell;
uniform float audioKick;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float racksP;
uniform float fogP;
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
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float racks = 6.0 + floor(clamp(racksP, 0.0, 1.0) * 6.0);           // racks per side
    float fogAmt = (0.35 + 0.7 * clamp(fogP, 0.0, 1.0)) * (0.35 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float walk = sceneAdvance * 0.22 + sceneTime * 0.045;

    float aisleHalf = 0.16;                                              // half-width at the camera
    // Perspective: depth z from the screen x of the aisle edge.
    // For a point on a rack face, |x| = aisleHalf * (1 + k*z) is the wall.
    vec3 col = vec3(0.02, 0.025, 0.035);
    // The end wall: a glass door with the photo behind it.
    float endMask = smoothstep(0.14, 0.1, length(p * vec2(1.0, 1.4)));
    vec3 doorCol = img(clamp(p * 2.4 + 0.5, 0.0, 1.0)) * mix(vec3(0.35, 0.45, 0.5), imgPalette(hue * 0.159 + 0.55), 0.4);
    col = mix(col, doorCol * 0.8 + 0.03, endMask);
    // The two rack rows.  For each pixel work out which side it is on and
    // the depth of the rack face that would project there.
    float side = sign(p.x);
    float ax = abs(p.x);
    // Corridor projection: the wall stands at a fixed world x, so its screen
    // x falls as 1/depth -- and its screen HEIGHT grows with its screen x.
    // (The first cut subtracted one from the depth, which left the racks
    // squeezed into the middle sixth of the frame.)
    float z = aisleHalf / max(ax, 1e-3);                                 // depth, 1 at the reference
    float hRack = 2.3 * ax;                                              // screen half-height there
    float onWall = step(ax, 0.75) * step(abs(p.y), hRack) * step(0.05, ax) * (1.0 - endMask);
    if (onWall > 0.5)
    {
        // Rack index along the aisle, moving with the walk.
        float along = z * 1.6 + walk;
        float ri = floor(along);
        float rf = fract(along);
        float unit = (p.y / max(hRack, 1e-3) * 0.5 + 0.5) * 26.0;         // rack units up the face
        float ui = floor(unit);
        float uf = fract(unit);
        // The rack face: dark metal with the photo as its printed labels.
        vec3 face = mix(vec3(0.09, 0.095, 0.1), img(clamp(vec2(rf * 0.3 + hash11(ri) * 0.5, p.y * 0.5 + 0.5), 0.0, 1.0)) * 0.35, 0.3);
        // Every unit is a slab with a seam.
        face *= 0.75 + 0.35 * smoothstep(0.05, 0.2, uf) * smoothstep(0.98, 0.85, uf);
        // The rack gap between cabinets.
        face *= 0.35 + 0.65 * smoothstep(0.03, 0.09, min(rf, 1.0 - rf));
        // LED column: one band per unit, the bar filling from the left.
        int band = int(mod(ui + ri * 3.0, 32.0));
        float e = clamp(audioSpectrum[band] * 1.7, 0.0, 1.0);
        float ledRow = step(abs(uf - 0.5), 0.22);
        float ledX = fract(rf * 8.0);
        float lit = smoothstep(0.55, 0.5, ledX) * step(ledX, e * 0.55 + 0.02);
        vec3 ledCol = mix(vec3(0.2, 1.0, 0.45), imgPalette(hue * 0.159 + float(band) / 32.0) * 1.4, 0.4);
        face += ledCol * ledRow * lit * (0.6 + 0.9 * e) * 2.0;
        // Fine activity blink on the treble, and a fault LED on the kick.
        float act = step(0.82, hash21(vec2(ri, ui))) * ledRow * step(ledX, 0.06);
        face += vec3(0.4, 0.9, 1.0) * act * (0.3 + 1.2 * hi);
        float faultUnit = step(0.965, hash21(vec2(floor(ri), floor(ui * 0.5))));
        face += vec3(1.0, 0.55, 0.1) * faultUnit * ledRow * step(0.7, ledX) * step(ledX, 0.8) * (0.2 + 1.4 * audioKick);
        // Distance fade into the cold air.
        float fade = exp(-z * 0.35);
        col = mix(col, face * (0.35 + 0.75 * fade), onWall * fade);
        col += ledCol * onWall * e * 0.02 * fade;                        // the wall's own spill
    }
    // Floor: perforated tiles with the reflection of the LEDs, and the
    // cold fog creeping out of them.
    if (p.y < -0.05)
    {
        float zz = 0.42 / max(-p.y, 1e-3);
        if (zz > 0.0)
        {
            float tile = smoothstep(0.02, 0.06, abs(fract(zz * 1.6 + walk) - 0.5))
                       * smoothstep(0.02, 0.06, abs(fract(p.x * (1.0 + zz) * 3.0) - 0.5));
            vec3 fl = mix(vec3(0.06, 0.065, 0.075), vec3(0.11, 0.12, 0.13), tile);
            // Perforations.
            vec2 hg = vec2(p.x * (1.0 + zz) * 22.0, zz * 12.0 + walk * 6.0);
            float holes = smoothstep(0.32, 0.2, length(fract(hg) - 0.5));
            fl *= 1.0 - 0.5 * holes;
            // The reflected glow of the racks either side.
            fl += mix(vec3(0.15, 0.5, 0.3), imgPalette(hue * 0.159 + 0.4), 0.4)
                * smoothstep(0.0, 0.35, abs(p.x)) * exp(-zz * 0.6) * 0.25;
            col = mix(col, fl * exp(-zz * 0.35), step(0.0, zz) * (1.0 - endMask));
            // Fog: it pours from the perforations and lies low.
            float fog = fogAmt * smoothstep(0.0, 0.35, -p.y - 0.05)
                      * (0.5 + 0.5 * noise2(vec2(p.x * 4.0, zz * 2.0 - walk * 1.5)));
            col = mix(col, mix(col, vec3(0.55, 0.62, 0.72), 0.65), clamp(fog, 0.0, 0.8));
        }
    }
    // Cable trays overhead, converging to the same point.
    if (p.y > 0.12)
    {
        float zz = 0.42 / max(p.y, 1e-3);
        if (zz > 0.0)
        {
            float tray = smoothstep(0.06, 0.02, abs(fract(zz * 1.6 + walk) - 0.5) - 0.42);
            vec3 trayCol = vec3(0.16, 0.17, 0.19);
            // Bundles of cable, coloured by band.
            float bundle = smoothstep(0.03, 0.0, abs(fract(p.x * (1.0 + zz) * 6.0) - 0.5) - 0.42);
            int bb = int(mod(floor(p.x * (1.0 + zz) * 6.0) + floor(zz * 3.0), 32.0));
            trayCol += imgPalette(hue * 0.159 + float(bb) / 32.0) * bundle * (0.15 + 0.5 * clamp(audioSpectrum[bb] * 1.6, 0.0, 1.0));
            col = mix(col, trayCol * exp(-zz * 0.4), tray * (1.0 - endMask) * 0.9);
        }
    }
    // The cold aisle's own haze toward the far end.
    col += vec3(0.1, 0.14, 0.2) * fogAmt * 0.25 * smoothstep(0.3, 0.0, length(p * vec2(0.7, 1.0)));
    col *= 0.85 + 0.3 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
