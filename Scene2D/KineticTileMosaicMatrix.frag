#version 330 core
out vec4 fragColor;
// KineticTileMosaicMatrix.frag
// -----------------------------------------------------------------------
// KINETIC TILE MOSAIC MATRIX: 100% viewport-filling architectural facade
// of thousands of mechanical kinetic tiles that elevate, flip, and rotate
// in 3D relief, physically reconstructing the loaded photo with specular
// bevel highlights, cast ambient shadows, and audio-reactive wave cascades.
// -----------------------------------------------------------------------

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
uniform float audioFlux;
uniform float audioChromaHue;
uniform float audioSpectrum[32];

uniform float densityP;
uniform float depthP;
uniform float speedP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
}

void main() {
    float den = (densityP > 0.0) ? densityP : 1.0;
    float dpt = (depthP   > 0.0) ? depthP   : 1.0;
    float spd = (speedP   > 0.0) ? speedP   : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.3 * spd + audioAdvance * 0.15;

    // Tile grid setup (50x50 to 80x80 matrix)
    vec2 gridUV = uv * 28.0 * den;
    vec2 tileID = floor(gridUV);
    vec2 localUV = fract(gridUV) - vec2(0.5);

    // Sample photo at the tile center
    vec2 photoUV = (tileID / (28.0 * den)) * 0.5 + vec2(0.5);
    vec3 tilePhoto = img(fract(photoUV));
    float tileLum = dot(tilePhoto, vec3(0.299, 0.587, 0.114));

    // Spectrum band elevation per tile column
    float tileHash = hash21(tileID);
    int specBand = int(clamp(tileHash * 31.0, 0.0, 31.0));
    float bandVal = audioSpectrum[specBand];

    // Audio-driven kinetic tile height displacement (3D relief)
    float waveX = sin(tileID.x * 0.3 + t * 3.0);
    float waveY = cos(tileID.y * 0.3 - t * 2.5);
    float height = (tileLum * 1.5 + bandVal * 2.0 + (waveX + waveY) * 0.4) * dpt * (0.8 + 0.6 * audioBass);

    // Mechanical tile flip / tilt angle
    float flipWave = sin(dot(tileID, vec2(0.5, 0.8)) * 0.4 - time * 6.0);
    float flipAngle = (height * 0.4 + smoothstep(0.7, 1.0, flipWave) * 1.2 * audioKick);

    // Tile border & beveled face
    vec2 beveled = abs(localUV) * 2.0;
    float tileBorder = max(beveled.x, beveled.y);
    float faceMask = smoothstep(0.95, 0.85, tileBorder); // 1 on face, 0 at gap
    float bevelGlint = smoothstep(0.75, 0.90, tileBorder) * faceMask;

    // 3D Tile surface normal with tilt
    vec3 tileNormal = normalize(vec3(
        sin(flipAngle) * (localUV.x > 0.0 ? 1.0 : -1.0),
        cos(flipAngle) * (localUV.y > 0.0 ? 1.0 : -1.0),
        1.0
    ));

    // Dynamic lighting (sunlight from top-right)
    vec3 lightDir = normalize(vec3(0.5, 0.8, 1.2));
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    vec3 halfVec = normalize(lightDir + viewDir);

    float diff = max(dot(tileNormal, lightDir), 0.0);
    float spec = pow(max(dot(tileNormal, halfVec), 0.0), 32.0);

    // Ambient occlusion / cast shadow between elevated tiles
    float shadow = clamp(1.0 - (1.0 - height * 0.3) * (1.0 - faceMask) * 1.5, 0.1, 1.0);

    // Mosaic coloring
    vec3 tileCol = tilePhoto * (diff * 0.7 + 0.3) * (0.8 + 0.4 * audioLevel);
    tileCol += vec3(1.0, 0.95, 0.85) * spec * (0.8 + 1.5 * audioHigh);
    tileCol += vec3(1.0, 0.8, 0.4) * bevelGlint * (0.6 + 1.2 * audioMid); // Golden bevel shine

    vec3 col = tileCol * faceMask * shadow;

    // Dark chassis background in tile gaps
    col += vec3(0.02, 0.03, 0.05) * (1.0 - faceMask);

    // Laser scan beam traveling across mosaic
    float scanLine = exp(-abs(uv.y - sin(time * 2.0) * 0.5) * 25.0) * (0.4 + 1.2 * audioKick);
    col += vec3(0.1, 0.8, 1.0) * scanLine;

    col = hueRot(col, audioChromaHue + hue);
    col = pow(col, vec3(0.9));

    fragColor = vec4(col, 1.0);
}
