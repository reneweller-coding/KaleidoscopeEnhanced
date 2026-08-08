#version 120
// MosaicWave.vert — a huge curved mosaic wall (100 x 30 tiles) showing the
// current image; flip waves sweep across it with the bar, kicks pop the
// tile under the wave.  Tiles flip around their vertical axis — the back
// side shows a hue-shifted variant.  attrA.xy = tile corner, attrA.w = tile.

attribute vec4 attrA;
attribute vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioBarPhase;
uniform float audioKick;
uniform float audioSwell;

varying vec2  vUV;
varying float vFlip;
varying float vLight;

void main()
{
    float idx = attrA.w;
    float cx  = mod(idx, 100.0);             // column 0..99
    float cy  = floor(idx / 100.0);          // row    0..29

    // Wall: 120-degree arc of radius 34 around the camera.
    float ang = (cx / 100.0 - 0.5) * 2.09;   // +-60 deg
    float y   = (cy - 14.5) * 1.55;
    float R   = 34.0;

    // Flip wave: travels across the columns once per bar (+ a slow drift so
    // quiet passages still shimmer).
    float wavePos = fract(audioBarPhase + time * 0.02);
    float dist    = abs(cx / 100.0 - wavePos);
    dist = min(dist, 1.0 - dist);
    float flip = 3.14159265 * exp(-dist * 9.0)
               * (0.55 + 0.45 * audioSwell + 0.6 * audioKick);

    vec2 corner = (attrA.xy - 0.5) * 1.45;   // tile 1.45 x 1.45

    // Tile frame on the cylinder wall, flipped around its vertical axis.
    vec3 centre = vec3(sin(ang) * R, y, cos(ang) * R);
    vec3 tangent = vec3(cos(ang), 0.0, -sin(ang));      // along the wall
    vec3 normal  = -normalize(vec3(centre.x, 0.0, centre.z));
    vec3 right   = tangent * cos(flip) + normal * sin(flip);
    vec3 up      = vec3(0.0, 1.0, 0.0);

    vec3 vp = centre + right * corner.x + up * corner.y;

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;

    // Tile shows its cell of the image spread over the whole wall.
    vUV    = vec2(cx / 100.0 + attrA.x / 100.0, cy / 30.0 + attrA.y / 30.0);
    vFlip  = cos(flip);                       // <0 while showing the back
    vLight = 1.0 + 0.9 * exp(-dist * 9.0);    // the wave carries light
}
