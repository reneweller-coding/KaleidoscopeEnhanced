/**
 * @file FxEffectMulti.cpp
 * @brief Implementation of FxEffectMulti: the `copies` uniform driving FxMulti.frag.
 */
#include <float.h>

#include "shader_setup.h"
#include "FxEffectMulti.h"

#include <QtGui/QImageReader>
#include <QtCore/qdir.h>
#include <QtCore/qfileinfo.h>

#include<GL/GLU.h>

/**
 * @brief Constructs the effect and rolls its initial `copies` value.
 *
 * Note: `EffectShader();` in the body constructs and immediately destroys an
 * unrelated TEMPORARY EffectShader object (same pattern as FxEffectKaleidoscope's
 * constructor) - it does not call this object's base subobject constructor,
 * which already ran implicitly. Harmless but misleading; left as-is.
 */
FxEffectMulti::FxEffectMulti(): 
m_minCopies(3)
, m_maxCopies(12)
, m_copies(4.0)
{
	EffectShader();

	m_vertexShaderFilename = "..\\standard.vert";
	m_fragmentShaderFilename = "..\\FX\\FxMulti.frag";

	m_copies = (float) ( (qrand() % m_maxCopies) + m_minCopies);
}

// Destructor
FxEffectMulti::~FxEffectMulti()
{
}

/// Uploads `copies` after chaining to EffectShader::setUniforms().
void FxEffectMulti::setUniforms( float time, float interpolation, GLint texLoc1, GLint texLoc2 )
{
	EffectShader::setUniforms( time, interpolation, texLoc1, texLoc2 );
	glUniform1f( m_copiesUni, m_copies );
}


/**
 * @brief Sets up the GLSL runtime and creates shader.
 *
 * Chains to EffectShader::initUniforms() then resolves `copies`.
 */
void FxEffectMulti::initUniforms(int width, int height)
{	
	EffectShader::initUniforms(width, height);
    m_copiesUni = glGetUniformLocation( m_sh_prog_id, "copies" );

	checkGLErrors("loadShader 2");
}

/**
 * @brief Re-rolls `copies`.
 *
 * Does NOT chain to EffectShader::resetParameters() (same omission as
 * FxEffectKaleidoscope::resetParameters(); harmless here too since this class
 * registers no Uniforms/expressions of its own).
 */
void FxEffectMulti::resetParameters()
{
	m_copies = (float) ((qrand() % m_maxCopies)  + m_minCopies);
}