#version 330 core
out vec4 fragColor;
// MelodyScript.frag — additive ribbon ink (colour fully baked in the vert).
in vec4 vCol;

void main()
{
    fragColor = vec4(vCol.rgb, 1.0);
}
