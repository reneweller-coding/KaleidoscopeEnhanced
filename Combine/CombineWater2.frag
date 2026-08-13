#version 330 core
out vec4 fragColor;
uniform vec2 resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;




//vec4 col = interpolation * texture(tex0, c1) + (1.0-interpolation)*texture(tex1, c1); 

float rand(vec2 n) { return 0.5 + 0.5 * fract(sin(dot(n.xy, vec2(12.9898, 78.233)))* 43758.5453); }

float water(vec3 p) {
	float t = time / 4.;
	p.z += t * 2.; p.x += t * 2.;
	//vec3 c1 = texture(iChannel1, p.xz / 30.).xyz;
	vec3 c1 = interpolation * texture(tex0, p.xz / 30.).xyz + (1.0-interpolation)*texture(tex1, p.xz / 30.).xyz; //texture(iChannel1, p.xz / 30.).xyz;
	p.z += t * 3.; p.x += t * 0.5;
	vec3 c2 = interpolation * texture(tex0, p.xz / 30.).xyz + (1.0-interpolation)*texture(tex1, p.xz / 30.).xyz;
	p.z += t * 4.; p.x += t * 0.8;
	vec3 c3 = interpolation * texture(tex0, p.xz / 30.).xyz + (1.0-interpolation)*texture(tex1, p.xz / 30.).xyz;
	c1 += c2 - c3;
	float z = (c1.x + c1.y + c1.z) / 3.;
	return p.y + z / 4.;
}


float map(vec3 p) {
	float d = 100.0;
	d = water(p);
	return d;
}

float intersect(vec3 ro, vec3 rd) {
	float d = 0.0;
	for (int i = 0; i <= 100; i++) {
		float h = map(ro + rd * d);
		if (h < 0.1) return  d;
		d += h;
	}
	return 0.0;
}

vec3 norm(vec3 p) {
	float eps = .1;
	return normalize(vec3(
		map(p + vec3(eps, 0, 0)) - map(p + vec3(-eps, 0, 0)),
		map(p + vec3(0, eps, 0)) - map(p + vec3(0, -eps, 0)),
		map(p + vec3(0, 0, eps)) - map(p + vec3(0, 0, -eps))
	));
}

void main( void ) {
	vec2 uv = gl_FragCoord.xy / resolution.xy - 0.5;
	uv.x *= resolution.x / resolution.y;
	vec3 l1 = normalize(vec3(1, 1, 1));
	vec3 ro = vec3(-3, 7, -5);
	vec3 rc = vec3(0, 0, 0);
	vec3 ww = normalize(rc - ro);
	vec3 uu = normalize(cross(vec3(0,1,0), ww));
	vec3 vv = normalize(cross(rc - ro, uu));
	vec3 rd = normalize(uu * uv.x + vv * uv.y + ww);
	float d = intersect(ro, rd);
	vec3 c = vec3(0.0);
	if (d > 0.0) {
		vec3 p = ro + rd * d;
		vec3 n = norm(p);
		float spc = pow(max(0.0, dot(reflect(l1, n), rd)), 30.0);
		//vec4 ref = texture(iChannel0, normalize(reflect(rd, n)));
		vec3 ref = (interpolation * texture(tex0, normalize(reflect(rd, n)).xy) + (1.0-interpolation)*texture(tex1, normalize(reflect(rd, n)).xy)).rgb;
		//vec3 rfa = texture(iChannel1, (p+n).xz / 6.0).xyz * (8./d);
		vec3 rfa = interpolation * texture(tex0, (p+n).xz / 6.0).xyz * (8./d) + (1.0-interpolation)*texture(tex1, (p+n).xz / 6.0).xyz * (8./d);
		
		c = rfa.xyz + (ref.xyz * 0.5)+ spc;
	}
	fragColor = vec4(vec3(c), 1.0 );
}