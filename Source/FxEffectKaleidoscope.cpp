/**
 * @file FxEffectKaleidoscope.cpp
 * @brief Implementation of FxEffectKaleidoscope: the `sides`/`speed` uniforms driving
 *        FxKaleidoscope.frag.
 */
#include <float.h>

#include "shader_setup.h"
#include "FxEffectKaleidoscope.h"

#include <QtGui/QImageReader>
#include <QtCore/qdir.h>
#include <QtCore/qfileinfo.h>

#include<GL/GLU.h>

/**
 * @brief Constructs the effect and rolls its initial `sides` value.
 *
 * Note: `EffectShader();` in the body constructs and immediately destroys an
 * unrelated TEMPORARY EffectShader object - it does not call this object's base
 * subobject constructor (that already ran implicitly via the member-init list,
 * which names no base constructor). Harmless but misleading; left as-is.
 */
FxEffectKaleidoscope::FxEffectKaleidoscope(): 
m_minSides(2)
, m_maxSides(14)
, m_speedAct(0.01)
, m_speed(0.02)
, m_speedMin(0.02)//-0.02
, m_speedMax(0.09)//0.4
, m_sides(8.0)
{
	EffectShader();
	m_vertexShaderFilename = "..\\standard.vert";
	m_fragmentShaderFilename = "..\\FX\\FxKaleidoscope.frag";

	m_sides = (float) ( (qrand() % m_maxSides) + m_minSides);
}

// Destructor
FxEffectKaleidoscope::~FxEffectKaleidoscope()
{
}

/// Uploads `speed` and `sides` after chaining to EffectShader::setUniforms().
void FxEffectKaleidoscope::setUniforms( float time, float interpolation, GLint texLoc1, GLint texLoc2 )
{
	EffectShader::setUniforms( time, interpolation, texLoc1, texLoc2 );

    glUniform1f( m_speedUni, m_speedAct );
	glUniform1f( m_sidesUni, m_sides );
}


/**
 * @brief Sets up the GLSL runtime and creates shader.
 *
 * Chains to EffectShader::initUniforms() then resolves `sides` and `speed`.
 */
void FxEffectKaleidoscope::initUniforms(int width, int height)
{	
	EffectShader::initUniforms(width, height);
    m_sidesUni = glGetUniformLocation( m_sh_prog_id, "sides" );
    m_speedUni = glGetUniformLocation( m_sh_prog_id, "speed" );

	checkGLErrors("loadShader 2");
}

/**
 * @brief Re-rolls `speed` (clamped away from zero) and `sides`.
 *
 * Unlike TextureEffectKaleidoscopeBase::resetParameters(), this does NOT call
 * EffectShader::resetParameters() first, so this effect's m_timeSolo/
 * m_timeInterpolation and formula-layer seeds are never re-rolled after
 * construction (harmless in practice since this class registers no Uniforms
 * via addUniform/addExpression, but worth noting as an inconsistency with its
 * sibling classes).
 */
void FxEffectKaleidoscope::resetParameters()
{
	
	m_speed = (float) (m_speedMin + (((float)qrand() / (float) RAND_MAX) * (m_speedMax - m_speedMin)));
	if( fabs( m_speed ) < EPSILON )
		m_speed = EPSILON;
	m_speedAct = m_speed;

	m_sides = (float) ((qrand() % m_maxSides)  + m_minSides);
}