//@doc
 * @brief SHADED RELIEF PHOTO: a relief as in cartography: hill shading from a light source in the north-west that circles slowly, the photo's colour as the hypsometric tint and its brightness as the height; the resolution of the
 * terrain glides between coarse and fine, so the relief swells from broad hills to the finest grain and back.  The light's direction follows the phase of the music, the resolution the spectral spread.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the light circles (integrated)
 *   audioSpread     -> the resolution of the relief (coarse to fine)
 *
 * Knobs: reliefP (the exaggeration of the relief), hueP.
//@params reliefP
//@audio audioSpread
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float lod = 0.5 + 3.5 * (1.0 - clamp(audioSpread, 0.0, 1.0)) * (0.7 + 0.3 * sin(0.1 * sceneTime));
    float e = 0.004 * (1.0 + lod);
    vec2 g = vec2(luma(imgLod(uv + vec2(e, 0.0), lod)) - luma(imgLod(uv - vec2(e, 0.0), lod)),
                  luma(imgLod(uv + vec2(0.0, e), lod)) - luma(imgLod(uv - vec2(0.0, e), lod))) / (2.0 * e);
    float ex = 0.3 + 0.9 * clamp(reliefP, 0.0, 1.0);
    vec3 n = normalize(vec3(-g * ex, 1.0));
    float az = 2.356 + 0.08 * audioPhase + 0.01 * sceneTime;
    vec3 L1 = normalize(vec3(cos(az), sin(az), 0.7));
    vec3 L2 = normalize(vec3(cos(az + 1.2), sin(az + 1.2), 0.7));
    float hs = 0.65 * clamp(dot(n, L1), 0.0, 1.0) + 0.35 * clamp(dot(n, L2), 0.0, 1.0);
    vec3 c = imgLod(uv, lod * 0.5 + 0.3);
    finish(c * (0.35 + 0.95 * hs) * 1.05);
}
