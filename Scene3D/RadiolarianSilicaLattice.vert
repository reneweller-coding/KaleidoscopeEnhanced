#version 330 core
/**
 * @file RadiolarianSilicaLattice.vert
 * @brief Vertex stage companion to RadiolarianSilicaLattice.frag -- see that file's header for
 * this scene's description.
 */
// RadiolarianSilicaLattice.vert — 3,000 transparent icosahedral silica skeleton
// cards floating in deep-sea suspension with crystalline glass refractions.
//   attrA.xy = corner u/v (0..1), attrA.w = quad index
//   attrB    = per-quad seeds

in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioCentroid;   ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioHigh;   ///< High band level, 0..1.

uniform float latticeP;
uniform float scatterP;
uniform float glowP;   ///< Glow / afterglow knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

out vec4 vCol;   ///< Colour (from the vertex stage).
out vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec3 vNormal;   ///< Surface normal (from the vertex stage).
out vec3 vWorldPos;   ///< World position (from the vertex stage).

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}


/// IMG-PALETTE (house standard): colours come from a rotating arc in the
/// CURRENT slideshow image, so every activation inherits a fresh palette from
/// the photos; the arc follows the musical key (audioChromaHue is circular-
/// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}


/// House tint: bend a colour toward the photo palette while keeping its
/// luminance -- the identity look survives, only the hue follows the photos.
vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
}
/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float qi = attrA.w;
    vec2 corner = attrA.xy - 0.5; // -0.5..0.5
    vec4 seeds = attrB;

    float ltc = (latticeP > 0.0) ? latticeP : 1.0;
    float sct = (scatterP > 0.0) ? scatterP : 1.0;
    float glw = (glowP    > 0.0) ? glowP    : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    // Concentric spherical shells of radiolarian micro-skeletons
    float shellIdx = floor(qi / 300.0); // 10 shells
    float slotIdx = mod(qi, 300.0);

    // Golden spiral on sphere
    float phi = slotIdx * 2.3999632;
    float cosTheta = 1.0 - (slotIdx / 300.0) * 2.0;
    float sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));
    vec3 sphereDir = vec3(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);

    float shellRadius = (2.5 + shellIdx * 1.4) * ltc + audioSwell * 1.2;
    float rotSpeed = (0.8 / (1.0 + shellIdx * 0.3)) * ((mod(shellIdx, 2.0) > 0.5) ? 1.0 : -1.0);
    float angle = time * rotSpeed * 0.4 + audioAdvance * 0.1;

    mat3 rotY = mat3(cos(angle), 0.0, sin(angle), 0.0, 1.0, 0.0, -sin(angle), 0.0, cos(angle));
    vec3 centerPos = rotY * (sphereDir * shellRadius);

    // Dynamic kick burst
    centerPos += normalize(centerPos) * audioSwell * 0.9;

    // Card orientation: facing outwards + tumbling
    vec3 normal = rotY * sphereDir;
    vec3 tangent = normalize(cross(normal, vec3(0.0, 1.0, 0.0)));
    if (length(tangent) < 0.1) tangent = vec3(1.0, 0.0, 0.0);
    vec3 bitangent = cross(normal, tangent);

    vec3 cardSize = vec3(0.75, 0.75, 0.0);
    vec3 localPos = tangent * (corner.x * cardSize.x) + bitangent * (corner.y * cardSize.y);
    vec3 worldP = centerPos + localPos;

    // Camera space
    // Camera pulled back: the outer shell (r~15 + swell + kick) must NEVER
    // reach the eye (user saw shells colliding with the camera).
    vec3 camPos = vec3(0.0, 0.0, -23.0);
    vec3 relP = worldP - camPos;
    relP.x -= eyeOff;

    gl_Position = projM * vec4(relP.x, relP.y, -relP.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    vUV = attrA.xy;
    vNormal = normal;
    vWorldPos = worldP;

    // Transparent silica glass palette (pale aqua, crystal amethyst, sunlight gold)
    vec3 col = palTint(mix(vec3(0.2, 0.9, 1.0), vec3(0.8, 0.4, 1.0), shellIdx / 10.0), 0.30 * shellIdx / 10.0, 0.55);
    col = mix(col, vec3(1.0, 0.95, 0.6), seeds.w);

    if (hue > 0.001) col = hueRot(col, hue);

    vCol = vec4(col, 1.0);
}
