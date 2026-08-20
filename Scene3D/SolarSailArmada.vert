#version 330 core
/**
 * @file SolarSailArmada.vert
 * @brief attrA.xy = quad UV (0..1), attrA.w = quad ID (0..2999), attrB = seeds (GEOM_QUADS).
 *
 * Audio Reactivity (geometry; see the .frag header for the shading side):
 *   audioAdvance   -> orbital phase of the fleet (pre-integrated)
 *   audioSwell     -> base amplitude of the sails' tacking motion
 *   audioKick      -> sail size pulse
 *   audioSpread    -> FLEET DISPERSION: a narrow spectrum draws the armada
 *                     into a tight formation near the star, rich wide
 *                     harmonics scatter it out to the far orbits.  Applied to
 *                     a SEPARATE display radius, never to `r` itself -- `r`
 *                     feeds orbitSpeed, which multiplies absolute `time`, and
 *                     changing it would remap the whole orbital phase at once
 *   audioBuildUp   -> TACKING HARDER: as an EDM build climbs toward its drop
 *                     the sails pitch further over on each swing, so the fleet
 *                     flashes edge-on more and more violently.  Amplitude only
 *                     -- the swing's time coefficient stays constant
 *   audioSharpness -> GLINT LOBE: dull material gives a broad soft solar
 *                     sheen on the foil, harsh bright material a hard narrow
 *                     star.  The gain is scaled inversely to the lobe width,
 *                     so widening cannot brighten the (un-tonemapped) frame
 */
in vec4 attrA;
in vec4 attrB;

uniform mat4 projM;
uniform float eyeOff;
uniform float time;
uniform float audioPhase;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioSwell;
uniform float audioSpread;
uniform float audioBuildUp;
uniform float audioSharpness;

out vec3 vPos;
out vec3 vNormal;
out vec2 vUV;
out float vQuadID;
out float vGlint;

void main() {
    vec2 cornerUV = attrA.xy;
    float quadID = attrA.w;
    vec4 seed = attrB;

    // Orbital radius and spherical orbital mechanics.  `r` is FROZEN: it
    // feeds orbitSpeed, which multiplies absolute `time`, so making it
    // audio-reactive would remap the whole accumulated orbital phase in one
    // frame (the project-wide anti-flicker rule).
    float r = 1.8 + seed.x * 3.5;
    float orbitSpeed = 0.3 / sqrt(r);
    float phi = seed.y * 6.28318 + time * orbitSpeed + audioAdvance * 0.1;
    float theta = (seed.z - 0.5) * 2.2 + 0.3 * sin(time * 0.2 + seed.w * 6.28);

    // FLEET DISPERSION rides on a separate DISPLAY radius instead, which
    // touches no integrated phase: a narrow spectrum draws the armada into a
    // tight formation, rich harmonics scatter it out to the far orbits.
    float rDisp = r * (0.84 + 0.36 * clamp(audioSpread, 0.0, 1.0));

    // Quad center in 3D orbit
    vec3 center = vec3(
        rDisp * cos(phi) * cos(theta),
        rDisp * sin(theta),
        rDisp * sin(phi) * cos(theta)
    );

    // Sail orientation vectors (tacking into the solar wind from origin)
    vec3 sailNormal = normalize(center);
    vec3 tangentX = normalize(cross(sailNormal, vec3(0.0, 1.0, 0.0)));
    vec3 tangentY = cross(tangentX, sailNormal);

    // Audio-reactive sail pitching & waving.  A rising EDM build makes the
    // fleet TACK HARDER -- the swing amplitude grows toward the drop, so the
    // sails flash edge-on more and more.  Amplitude only: the swing's time
    // coefficient stays a constant.
    float pitchAngle = (0.2 + 0.3 * audioSwell + 0.45 * clamp(audioBuildUp, 0.0, 1.0))
                     * sin(time * 2.0 + seed.x * 10.0);
    float cp = cos(pitchAngle), sp = sin(pitchAngle);
    sailNormal = normalize(sailNormal * cp + tangentY * sp);
    tangentY = cross(tangentX, sailNormal);

    // Sail size and local vertex extrusion
    float sailSize = (0.12 + 0.06 * seed.w) * (1.0 + 0.3 * audioKick);
    vec2 localOffset = (cornerUV - vec2(0.5)) * sailSize;
    vec3 pos = center + tangentX * localOffset.x + tangentY * localOffset.y;

    // Specular solar glint aligned with camera
    vec3 viewDir = normalize(vec3(0.0, 0.0, 6.5) - center);
    vec3 lightDir = normalize(center); // Light comes from central star at origin
    vec3 halfVec = normalize(lightDir + viewDir);
    // SHARPNESS sets the glint's lobe: dull material -> a broad soft sheen
    // over the foil, harsh bright material -> a hard narrow star.  This scene
    // has no tonemap in the .frag, so the gain is scaled DOWN as the lobe
    // widens; a broad glint must not integrate to a brighter frame.
    float shp   = clamp(audioSharpness, 0.0, 1.0);
    float glint = pow(max(dot(sailNormal, halfVec), 0.0), mix(12.0, 64.0, shp))
                * (0.35 + 0.75 * shp);

    vPos = pos;
    vNormal = sailNormal;
    vUV = cornerUV;
    vQuadID = quadID;
    vGlint = glint;

    // Stereoscopic 3D camera projection
    vec3 vp = pos;
    vp.z += 6.5;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
