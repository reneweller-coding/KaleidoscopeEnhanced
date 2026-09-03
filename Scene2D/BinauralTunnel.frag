#version 330 core
out vec4 fragColor;
/**
 * @file BinauralTunnel.frag
 * @brief BINAURAL TUNNEL: a tunnel whose cross-section is the stereo image.
 * The left wall is pushed out by the left channel's energy, the right wall
 * by the right's, and the stereo width stretches the tube vertically: a mono
 * track is a round pipe, a wide mix a cathedral nave, a hard-panned part
 * bulges one wall.  Ribs stream past on the music's pace; each wall is lit
 * by its own channel, so the tube leans visibly toward whichever side is
 * playing.
 *
 * Audio Reactivity:
 *   audioStereoL / R -> left / right wall LIGHT (the whole point)
 *   audioStereo      -> the arris lines of the vault
 *   audioSwell       -> the vault opens on builds (slow geometry)
 *   sceneAdvance     -> forward travel (music-paced, continuous)
 *   audioKick        -> the ribs flash
 *   audioBass        -> throat glow
 *
 * Per-activation variety: ribP (rib spacing), zoomP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioStereo;
uniform float audioStereoL;
uniform float audioStereoR;
uniform float audioBass;
uniform float audioKick;
uniform float audioLevel;
uniform float audioSwell;
uniform float audioBarPhase;
uniform float audioMelodyPitch;
uniform float audioChromaHue;
uniform float audioValence;

uniform float ribP;
uniform float zoomP;
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

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float eL = clamp(audioStereoL, 0.0, 1.5);
    float eR = clamp(audioStereoR, 0.0, 1.5);
    float width = clamp(audioStereo, 0.0, 1.0);
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float zoom = (zoomP > 0.05) ? zoomP : 1.0;

    float r = length(p);
    float a = atan(p.y, p.x);

    // Cross-section: how much of this direction is "left" (1 at a = pi).
    float wL = 0.5 - 0.5 * cos(a);
    float side = wL * eL + (1.0 - wL) * eR;
    // Geometry on the slow swell only (V7d): the vault opens on builds.  The
    // channels are LIGHT on their walls, the width is the seam and the arris.
    float radius = 1.0 + 0.45 * abs(sin(a)) * clamp(audioSwell, 0.0, 1.0);
    radius *= zoom;

    float rr = r / radius;
    float depth = 1.0 / max(rr, 0.02);
    float travel = sceneAdvance * 1.4 + sceneTime * 0.3;
    float z = depth + travel;

    // Wall texture: the photo rolled around the tube, a hair of spiral from
    // the melody (small, so the far wall does not shear).
    float twist = 0.0;
    vec2 uv = vec2(fract((a + z * twist) * 0.15915494 * 3.0 + sceneAdvance * 0.02), fract(z * 0.1));
    vec3 tex = img(uv);

    // Ribs streaming past; the kick flashes them.
    float ribs = pow(0.5 + 0.5 * cos(z * (ribP > 0.1 ? ribP : 2.0)), 10.0);
    float ribL = ribs * (0.6 + 1.4 * audioKick);

    // Each wall lit by its own channel: left cool, right warm.
    vec3 lightL = imgPalette(hue * 0.159 + 0.55) * eL;
    vec3 lightR = imgPalette(hue * 0.159 + 0.95) * eR;
    vec3 light  = mix(lightR, lightL, wL) * 1.4 + 0.25;

    vec3 col = tex * light * (1.3 + 0.7 * audioLevel) + imgPalette(hue * 0.159 + 0.75) * ribL * 0.8;

    // Nave lines: when the mix is wide, bright arris lines run along the top
    // and bottom of the vault.
    float arris = exp(-abs(abs(sin(a)) - 1.0) * 30.0) * width;
    col += imgPalette(hue * 0.159 + 0.3) * arris * 0.6;

    // Fog with depth (rises with distance) and a throat glow on the bass.
    float fog = 1.0 - exp(-depth * 0.055);
    col = mix(col, vec3(0.0), clamp(fog, 0.0, 0.93));
    col += imgPalette(hue * 0.159 + 0.1) * exp(-rr * 7.0) * (0.3 + 1.0 * audioBass);
    col *= 0.85 + 0.35 * audioSwell;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
