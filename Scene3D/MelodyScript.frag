#version 120
// MelodyScript.frag — additive ribbon ink (colour fully baked in the vert).
varying vec4 vCol;

void main()
{
    gl_FragColor = vec4(vCol.rgb, 1.0);
}
