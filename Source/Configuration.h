/**
 * @file Configuration.h
 * @brief Loader for a single preset/config XML file (Configurations/ *.xml) into the runtime shader/uniform object graph.
 */
#ifndef CONFIGURATION_H
#define CONFIGURATION_H

#include <QtGui/qopengl.h>
#include <QtCore/QElapsedTimer>
#include <QtCore/QThread>

#include <QtXml/QDomDocument>
#include <QtXml/QDomElement>
#include <QtXml/QDomNodeList>

#include "stdinc.h"
#include "Uniform.h"
#include "FilterShader.h"

/**
 * @brief Parses one preset XML file and builds the FilterShader/EffectShader object graph it describes.
 *
 * A Configuration corresponds 1:1 to a Configurations/ *.xml preset file: its
 * constructor parses the document (readConfiguration()) into a freshly
 * allocated FilterShader, wiring up every TextureShader / CombineShader entry
 * (including their per-uniform ranges and `<expr>` formulas) and the preset's
 * image-cycling timing/mood metadata. It owns that FilterShader for the
 * lifetime of the Configuration and deletes it in the destructor. start()/
 * stop() just forward to the owned FilterShader; isHidden() exposes whether
 * this preset is a reference/test-bench build that should be excluded from
 * user-facing selection.
 */
class Configuration
{
public:
	/**
	 * @brief Loads and parses a preset XML file, building the full shader/uniform graph.
	 * @param configurationFile Path to the Configurations/ *.xml preset file to load.
	 */
	Configuration( const QString &configurationFile );
	/** @brief Destroys the owned FilterShader (and, transitively, everything it built). */
	~Configuration( );

	QString getConfigurationName() { return m_configurationName; }; ///< @return The preset's display name (root element's ConfigurationName attribute).
	// hidden="true" on the root element: a master/reference or test-bench
	// preset that must not appear in the user-facing selection (menu, digit
	// keys, web remote, auto-config).  Still loadable via -c <name>.
	/** @brief Whether this preset is hidden from user-facing selection (still loadable explicitly via `-c <name>`).
	 * @return True if the root element had `hidden="true"`. */
	bool isHidden() const { return m_hidden; }
	/**
	 * @brief Starts the owned FilterShader's GL resources/scheduler for the given viewport size.
	 * @param width Viewport width in pixels.
	 * @param height Viewport height in pixels.
	 */
	void start( int width, int height );
	/** @brief Stops the owned FilterShader (releases its running state). */
	void stop();

	FilterShader *m_filterShader; ///< The shader/scene pipeline built by readConfiguration(); owned (deleted in the destructor).

private:

	/**
	 * @brief Parses the preset XML document and populates m_filterShader with its TextureShader/CombineShader entries.
	 * @param filename Path to the Configurations/ *.xml preset file.
	 */
	void readConfiguration( const QString &filename );
	/**
	 * @brief Reads a shader element's child uniform-declaration tags (interpolator/bool/float/int/expr) and registers them on the shader.
	 * @param shader The EffectShader (or subclass) to register the parsed uniforms/expressions on.
	 * @param el The `<TextureShader>` or `<CombineShader>` XML element whose children to walk.
	 */
	void addUniforms( EffectShader *shader, QDomElement &el );

	QString m_imageDirectory;      ///< Root image directory for this preset (root element's ImageDirectory attribute), passed to FilterShader::init().
	QString m_configurationName;   ///< Preset display name (root element's ConfigurationName attribute); also used as the taste-learning namespace.
	bool    m_hidden = false;      ///< True when the root element has hidden="true" (excluded from user-facing preset selection).

	unsigned int		m_timeTextureInterpolationMin; ///< Preset-wide minimum image cross-fade duration (seconds); falls back to a baseline when absent/0 in the XML.
	unsigned int		m_timeTextureInterpolationMax; ///< Preset-wide maximum image cross-fade duration (seconds); falls back to a baseline when absent/invalid in the XML.
	unsigned int		m_timeTextureSoloMin;          ///< Preset-wide minimum time an image is held solo (seconds); falls back to a baseline when absent/0 in the XML.
	unsigned int		m_timeTextureSoloMax;          ///< Preset-wide maximum time an image is held solo (seconds); falls back to a baseline when absent/invalid in the XML.

};


#endif