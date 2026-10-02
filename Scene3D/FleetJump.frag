#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file FleetJump.frag
 * @brief Fragment stage for FleetJump: hulls from their own material, drives
 * spooling up along the arc (light), a hyperspace streak tint as a craft
 * jumps; the sky shell is a starfield with a faint nebula the drives light
 * on the kick.
 *
 * Audio Reactivity: audioKick pulses the drive glow; audioSwell brightens the
 *                   key light; sceneProgress spools the drives.
 */
uniform sampler2DArray texMeshMaterial;   ///< The mesh's material textures (albedo, roughness, normal ...).
uniform int texMeshMaterialLayers;   ///< Number of layers in texMeshMaterial.
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform float sceneProgress;   ///< Progress through this scene's solo time, 0..1.
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

in vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in vec3 vNormal;   ///< Surface normal (from the vertex stage).
in vec3 vPos;   ///< Position (from the vertex stage).
in float vBg;   ///< Background flag (from the vertex stage).
in float vJump;
in float vAlong;

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief The house palette: a colour of the photo on an arc that turns with the music's hue.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

/// @brief Pseudo-random number 0..1 from a 3D point.
float hash13(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }

/// @brief Exposure that brings the material's average brightness to a common level.
float materialExposure(sampler2DArray tex)
{
    vec3 avg = textureLod(tex, vec3(0.5, 0.5, 0.0), 20.0).rgb;
    float l = dot(avg, vec3(0.299, 0.587, 0.114));
    return clamp(0.20 / max(l, 0.02), 0.30, 2.0);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float hue = (hueP > 0.001) ? hueP : 0.0;
    vec3 driveCol = imgPalette(hue * 0.159 + 0.55) * 1.5 + vec3(0.2, 0.4, 0.8);
    if (vBg > 0.5)
    {
        vec3 d = normalize(vPos);
        vec3 sp = d * 90.0;
        vec3 cell = floor(sp);
        vec3 off = vec3(hash13(cell + 1.7), hash13(cell + 5.3), hash13(cell + 9.1)) - 0.5;
        vec3 f = fract(sp) - 0.5 - off * 0.6;
        float star = smoothstep(0.14, 0.02, length(f)) * step(0.982, hash13(cell)) * (0.5 + 0.6 * hash13(cell + 2.2));
        vec3 col = vec3(star) * 0.8 + imgPalette(hue * 0.159 + 0.6) * 0.03 * (1.0 + 0.5 * audioKick);
        fragColor = vec4(col, 1.0);
        return;
    }

    vec4 base = texture(texMeshMaterial, vec3(vUV, 0.0));
    if (base.a < 0.1) discard;
    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(-vPos);
    vec3 lightDir = normalize(vec3(0.4, 0.7, -0.5));
    float diff = max(dot(n, lightDir), 0.0);
    float fill = 0.5 + 0.5 * dot(n, vec3(0.0, 1.0, 0.0));
    float expose = materialExposure(texMeshMaterial);
    vec3 col = base.rgb * expose * (0.45 + diff * (1.2 + 0.5 * audioSwell) + fill * 0.3) * (0.8 + 0.3 * audioLevel);
    // Drives at the tail spool up along the arc and pulse on the kick.
    float spool = smoothstep(0.2, 0.75, clamp(sceneProgress, 0.0, 1.0));
    float tail = 1.0 - smoothstep(0.0, 0.25, vAlong);
    col += driveCol * tail * spool * (0.4 + 0.6 * audioKick);
    // The jump: the whole hull turns into a streak of drive light.
    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
    col = mix(col, driveCol * (0.8 + fresnel), vJump * 0.9);

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
