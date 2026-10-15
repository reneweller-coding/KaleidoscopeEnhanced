/**
 * @file EditorWindow.cpp
 * @brief Implements EditorWindow: builds the editor UI and drives the live preview, preset table, and per-entry
 * parameter/formula/audio-mapping editor.
 */
#include "EditorWindow.h"
#include "PreviewWidget.h"

#include <QtWidgets/QComboBox>
#include <QtWidgets/QSlider>
#include <QtWidgets/QSpinBox>
#include <QtWidgets/QCheckBox>
#include <QtCore/QRegularExpression>
#include <QtCore/QRandomGenerator>
#include <QtWidgets/QDoubleSpinBox>
#include <QtWidgets/QLineEdit>
#include <QtWidgets/QTableWidget>
#include <QtWidgets/QHeaderView>
#include <QtWidgets/QLabel>
#include <QtWidgets/QPushButton>
#include <QtWidgets/QGroupBox>
#include <QtWidgets/QFormLayout>
#include <QtWidgets/QVBoxLayout>
#include <QtWidgets/QHBoxLayout>
#include <QtWidgets/QSplitter>
#include <QtWidgets/QScrollArea>
#include <QtWidgets/QFileDialog>
#include <QtWidgets/QMessageBox>
#include <QtWidgets/QApplication>
#include <QtWidgets/QStatusBar>
#include <QtCore/QDir>
#include <QtCore/QFileInfo>
#include <QtCore/QFile>
#include <QtCore/QSet>
#include <QtCore/QTimer>
#include <QtGui/QKeyEvent>
#include <algorithm>

// Real-analyzer WAV preview: the actual analysis pipeline + looped playback.
#include "../Source/AudioAnalyzer.h"
#include "../Source/ExprEval.h"
#include <windows.h>
#include <mmsystem.h>

/**
 * @brief Convenience constructor for a QSpinBox with a given range and initial value.
 * @param lo Minimum value.
 * @param hi Maximum value.
 * @param val Initial value.
 * @return The newly-constructed (unparented) QSpinBox.
 */
static QSpinBox *mkSpin( int lo, int hi, int val )
{
    QSpinBox *s = new QSpinBox();
    s->setRange( lo, hi );
    s->setValue( val );
    return s;
}

/**
 * @brief Placeholder text for the range/mapping box while no table row is selected.
 * @return The how-to-use hint text.
 *
 * Placeholder for the range/mapping box while no table row is selected --
 * shared between the constructor and rebuildRangeEditor()'s no-selection
 * branch (which must RESTORE it after the parameter-less-entry message).
 */
static QString rangeHowToText()
{
    return EditorWindow::tr(
        "Hier erscheinen die Einstellungen des in „Preset contents“ "
        "GEWÄHLTEN Eintrags:\n"
        "  • Min/Max-Bereiche je Parameter\n"
        "  • Formel-Mapping: Formel statt Zufallswert je <float>-Parameter\n"
        "  • Audio-Mapping: welches Musiksignal welche audio*-Uniform speist\n"
        "Dazu einen Eintrag anlegen („Add texture effect“) oder ein "
        "Preset öffnen – und seine Zeile in der Tabelle anklicken." );
}

// Builds the entire editor UI: the live preview widget plus the right-hand
// control panel (preview selection, live parameter sliders, add-to-preset
// panel, preset contents table, per-entry range/mapping editor, preset
// metadata + file actions), wires all signals, then does the initial
// shader scan and preset/UI sync.
EditorWindow::EditorWindow( const QString &projectRoot, QWidget *parent )
    : QMainWindow( parent ),
      m_root( projectRoot )
{
    setWindowTitle( "Kaleidoscope — Preset Editor" );
    resize( 1180, 760 );

    // Reference param set for defaultParamsFor()/rebuildRangeEditor(): loaded
    // once (not per lookup, unlike the regex-based komplettParamsFor() the
    // preview sliders use) because Preset::load() parses real XML via
    // QDomDocument and is comparatively expensive to re-run per keystroke.
    Preset::load( presetsDir( m_root ) + "/Komplett.xml", m_komplett );

    m_preview = new PreviewWidget( m_root );
    connect( m_preview, &PreviewWidget::statusChanged,
             this, [this]( const QString &t )
    { if (m_status) m_status->setText(t); } );

    // ---- right-hand control panel ----
    QWidget     *panel = new QWidget();
    QVBoxLayout *pl = new QVBoxLayout( panel );

    // Preview selection
    QGroupBox   *g_sel = new QGroupBox( "Preview  (keys: [ ] texture · , . combine · m music)" );
    QFormLayout *f_sel = new QFormLayout( g_sel );
    m_texCombo = new QComboBox();
    m_combCombo = new QComboBox();
    f_sel->addRow( "Texture shader", m_texCombo );
    f_sel->addRow( "Combine shader", m_combCombo );
    QComboBox *music_combo = new QComboBox();
    music_combo->addItems( { "Beat (120 BPM kicks)", "Drone (ambient swells)" } );
    f_sel->addRow( "Music", music_combo );
    m_musicCombo = music_combo;
    // REAL audio preview: a WAV is analysed by the actual AudioAnalyzer and
    // its feature timeline (+ the sound, looped) drives the preview.
    QPushButton *b_wav = new QPushButton( "Audio-WAV…  (w)" );
    f_sel->addRow( "Real audio", b_wav );
    pl->addWidget( g_sel );

    // Live sliders for the previewed shaders' per-activation parameters
    // (ranges from Komplett.xml; values override the preview defaults).
    m_paramBox = new QGroupBox( "Shader-Parameter (Preview)" );
    QVBoxLayout *pv = new QVBoxLayout( m_paramBox );
    QWidget     *pf_host = new QWidget();
    m_paramForm = new QFormLayout( pf_host );
    m_paramForm->setContentsMargins( 0, 0, 0, 0 );
    pv->addWidget( pf_host );
    QHBoxLayout *p_btns = new QHBoxLayout();
    QPushButton *b_dice = new QPushButton( "Würfeln" );
    QPushButton *b_freeze = new QPushButton( "Als Festwerte in gewählten Eintrag" );
    b_dice->setToolTip( "Alle Parameter-Slider zufällig setzen" );
    b_freeze->setToolTip( "Die aktuellen Slider-Werte als min=max-Parameter in den in der "
                          "Tabelle gewählten Preset-Eintrag schreiben" );
    p_btns->addWidget( b_dice );
    p_btns->addWidget( b_freeze );
    pv->addLayout( p_btns );
    // Transition test bench: sweep the currently selected combine/transition
    // shader's interpolation back and forth in slow motion (~10 s round
    // trip).  Since the Transitions/ split the combine combo lists the
    // transition shaders too, so any of them can be inspected here.
    QHBoxLayout *t_bench = new QHBoxLayout();
    m_transCheck = new QCheckBox( "Übergangs-Zeitlupe" );
    m_transCheck->setToolTip( "Überblendung des gewählten Combine-/Transition-"
                              "Shaders in Zeitlupe hin- und herfahren. "
                              "Headless-Prüfung aller Transitions: PresetEditor --transcheck" );
    t_bench->addWidget( m_transCheck );
    t_bench->addStretch( 1 );
    pv->addLayout( t_bench );
    auto apply_bench = [this]
    {
        m_preview->setTransTest( m_transCheck->isChecked() ? 0 : -1 );
    };
    connect( m_transCheck, &QCheckBox::toggled, this, apply_bench );
    pl->addWidget( m_paramBox );
    connect( b_dice, &QPushButton::clicked, this, &EditorWindow::randomizeParams );
    connect( b_freeze, &QPushButton::clicked, this, &EditorWindow::freezeParamsIntoEntry );

    // Add-to-preset
    QGroupBox   *g_add = new QGroupBox( "Add current shader to preset" );
    QFormLayout *f_add = new QFormLayout( g_add );
    m_typeCombo = new QComboBox();
    m_typeCombo->addItems( { "normal", "KaleidoscopeBase", "scene3d" } );
    // scene3d-only fields (geom is required by the engine; stateBytes/
    // shadowExtent are optional, 0 = attribute omitted, matching Configuration.cpp).
    m_geomCombo = new QComboBox();
    m_geomCombo->addItems( { "points", "cubes", "ribbon", "grid", "quads",
                             "patches", "scatter", "indirect" } );
    m_stateBytesSpin = mkSpin( 0, 8 * 1024 * 1024, 0 );
    m_stateBytesSpin->setSpecialValueText( "(none)" );
    m_shadowExtentSpin = new QDoubleSpinBox();
    m_shadowExtentSpin->setRange( 0.0, 500.0 );
    m_shadowExtentSpin->setSpecialValueText( "(engine default)" );
    m_minSolo = mkSpin( 0, 100000, 20 );
    m_maxSolo = mkSpin( 0, 100000, 80 );
    m_minInterp = mkSpin( 0, 100000, 15 );
    m_maxInterp = mkSpin( 0, 100000, 50 );
    m_prob = new QDoubleSpinBox();
    m_prob->setRange( 0.0, 1.0 );
    m_prob->setSingleStep( 0.05 );
    m_prob->setValue( 0.5 );
    m_complex = mkSpin( 1, 20, 1 );
    f_add->addRow( "Type (texture)", m_typeCombo );
    f_add->addRow( "Geom (scene3d)", m_geomCombo );
    f_add->addRow( "stateBytes (scene3d)", m_stateBytesSpin );
    f_add->addRow( "shadowExtent (scene3d)", m_shadowExtentSpin );
    f_add->addRow( "minTimeSolo", m_minSolo );
    f_add->addRow( "maxTimeSolo", m_maxSolo );
    f_add->addRow( "minTimeInterpolation", m_minInterp );
    f_add->addRow( "maxTimeInterpolation", m_maxInterp );
    f_add->addRow( "probability", m_prob );
    f_add->addRow( "complexity", m_complex );
    QHBoxLayout *add_btns = new QHBoxLayout();
    QPushButton *b_add_tex = new QPushButton( "Add texture effect  (a)" );
    QPushButton *b_add_comb = new QPushButton( "Add combine  (c)" );
    add_btns->addWidget( b_add_tex );
    add_btns->addWidget( b_add_comb );
    f_add->addRow( add_btns );
    pl->addWidget( g_add );

    // Preset contents table
    QGroupBox   *g_tab = new QGroupBox( "Preset contents" );
    QVBoxLayout *v_tab = new QVBoxLayout( g_tab );
    m_table = new QTableWidget( 0, 10 );
    m_table->setHorizontalHeaderLabels(
        { "Kind", "File", "Type", "Geom", "SoloMin", "SoloMax", "IntMin", "IntMax", "Prob", "Cplx" } );
    m_table->horizontalHeader()->setSectionResizeMode( 1, QHeaderView::Stretch );
    m_table->setSelectionBehavior( QAbstractItemView::SelectRows );
    m_table->setEditTriggers( QAbstractItemView::NoEditTriggers );
    v_tab->addWidget( m_table );
    QPushButton *b_remove = new QPushButton( "Remove selected  (Del)" );
    v_tab->addWidget( b_remove );
    pl->addWidget( g_tab, 1 );

    // Per-entry parameter range editor: lets the SELECTED table row deviate
    // from Komplett.xml's default range deliberately (different min/max per
    // preset, not just a different probability) -- select a row to populate.
    m_rangeBox = new QGroupBox( "Gewählter Eintrag: Parameter · Formel-Mapping · Audio-Mapping" );
    QVBoxLayout *rv = new QVBoxLayout( m_rangeBox );
    // Always visible, with a placeholder while nothing is selected: this box
    // is where the per-preset MAPPING lives (which music signal drives which
    // uniform), and an invisible box made that feature undiscoverable.
    m_rangeHint = new QLabel( rangeHowToText() );
    m_rangeHint->setWordWrap( true );
    m_rangeHint->setStyleSheet( "color: #888;" );
    rv->addWidget( m_rangeHint );
    QWidget *rf_host = new QWidget();
    m_rangeForm = new QFormLayout( rf_host );
    m_rangeForm->setContentsMargins( 0, 0, 0, 0 );
    rv->addWidget( rf_host );
    pl->addWidget( m_rangeBox );

    // Preset metadata + file actions
    QGroupBox   *g_meta = new QGroupBox( "Preset" );
    QFormLayout *f_meta = new QFormLayout( g_meta );
    m_nameEdit = new QLineEdit( "MyPreset" );
    m_imgDirEdit = new QLineEdit();
    QPushButton *b_browse = new QPushButton( "…" );
    QHBoxLayout *img_row = new QHBoxLayout();
    img_row->addWidget( m_imgDirEdit );
    img_row->addWidget( b_browse );
    m_gSoloMin = mkSpin( 0, 100000, 10 );
    m_gSoloMax = mkSpin( 0, 100000, 40 );
    m_gInterpMin = mkSpin( 0, 100000, 20 );
    m_gInterpMax = mkSpin( 0, 100000, 80 );
    f_meta->addRow( "Name", m_nameEdit );
    m_hiddenCheck = new QCheckBox( tr( "verborgen (hidden) – nicht im Hauptprogramm wählbar" ) );
    m_hiddenCheck->setToolTip( tr( "Schreibt hidden=\"true\" in die XML: das Hauptprogramm "
                                   "zeigt dieses Preset weder im Menü noch auf den Zifferntasten "
                                   "oder in der Web-Fernbedienung. Nur -c <Name> lädt es noch — "
                                   "gedacht für Master-/Referenz-Presets wie Komplett und die "
                                   "Test*-Prüfstände." ) );
    f_meta->addRow( "", m_hiddenCheck );
    f_meta->addRow( "ImageDirectory", img_row );
    f_meta->addRow( "timeTextureSoloMin", m_gSoloMin );
    f_meta->addRow( "timeTextureSoloMax", m_gSoloMax );
    f_meta->addRow( "timeTextureInterpolationMin", m_gInterpMin );
    f_meta->addRow( "timeTextureInterpolationMax", m_gInterpMax );
    QHBoxLayout *file_btns = new QHBoxLayout();
    QPushButton *b_new = new QPushButton( "New" );
    QPushButton *b_open = new QPushButton( "Open…" );
    QPushButton *b_save = new QPushButton( "Save" );
    file_btns->addWidget( b_new );
    file_btns->addWidget( b_open );
    file_btns->addWidget( b_save );
    f_meta->addRow( file_btns );
    pl->addWidget( g_meta );

    QScrollArea *scroll = new QScrollArea();
    scroll->setWidget( panel );
    scroll->setWidgetResizable( true );
    scroll->setMinimumWidth( 430 );
    scroll->setMaximumWidth( 520 );

    QSplitter *split = new QSplitter();
    split->addWidget( m_preview );
    split->addWidget( scroll );
    split->setStretchFactor( 0, 1 );
    setCentralWidget( split );

    m_status = new QLabel( "ready" );
    statusBar()->addWidget( m_status );

    // ---- wiring ----
    connect( m_texCombo, &QComboBox::currentTextChanged, this, &EditorWindow::onTextureChanged );
    connect( m_combCombo, &QComboBox::currentTextChanged, this, &EditorWindow::onCombineChanged );
    // Tuning geom/stateBytes/shadowExtent for the CURRENTLY previewed scene3d
    // shader should update the live preview immediately, the same way the
    // parameter sliders already do -- otherwise the fields would look inert
    // until the next unrelated preview refresh.
    connect( m_geomCombo, &QComboBox::currentTextChanged, this, [this]
    {
        if ( isScene3D( m_texCombo->currentText() ) )
            pushPreviewTexture();
    } );
    connect( m_stateBytesSpin, QOverload<int>::of( &QSpinBox::valueChanged ), this, [this]
    {
        if ( isScene3D( m_texCombo->currentText() ) )
            pushPreviewTexture();
    } );
    connect( m_shadowExtentSpin, QOverload<double>::of( &QDoubleSpinBox::valueChanged ), this, [this]
    {
        if ( isScene3D( m_texCombo->currentText() ) )
            pushPreviewTexture();
    } );
    connect( music_combo, &QComboBox::currentIndexChanged, this, [this]( int i )
    {
        m_preview->setMusicMode( i == 1 ? PreviewWidget::DRONE : PreviewWidget::BEAT );
    } );
    connect( b_add_tex, &QPushButton::clicked, this, &EditorWindow::addTextureEntry );
    connect( b_add_comb, &QPushButton::clicked, this, &EditorWindow::addCombineEntry );
    connect( b_remove, &QPushButton::clicked, this, &EditorWindow::removeSelectedEntry );
    connect( m_table, &QTableWidget::itemSelectionChanged, this, &EditorWindow::onTableSelectionChanged );
    connect( b_new, &QPushButton::clicked, this, &EditorWindow::newPreset );
    connect( b_open, &QPushButton::clicked, this, &EditorWindow::openPreset );
    connect( b_save, &QPushButton::clicked, this, &EditorWindow::savePreset );
    connect( b_browse, &QPushButton::clicked, this, &EditorWindow::browseImageDir );
    connect( b_wav, &QPushButton::clicked, this, &EditorWindow::loadAudioWav );

    m_exprTimer = new QTimer( this );
    connect( m_exprTimer, &QTimer::timeout, this, &EditorWindow::tickExprValues );
    m_exprTimer->start( 150 );

    scanShaders();
    metaToUi();
    onTextureChanged();
    onCombineChanged();
}

void EditorWindow::scanShaders()
{
    // The user-selectable shaders live in Scene2D/, Scene3D/, FX/ and
    // Transitions/ (Engine/ holds the internal pipeline passes and is not
    // listed).  NOTE: this scanned the pre-rename "Scene"/"Combine" folders
    // until the Transitions split - both QDirs came back empty, so the
    // combos listed no 2D scenes and no combines at all (dormant since the
    // Variante-A rename, same class of bug as the glwidget hot-reload).
    // Scene3D shaders share the texture-shader combo with the 2D ones --
    // onTextureChanged() tells them apart by which folder they were actually
    // found in (m_scene3DFiles), not by any naming convention.  Transitions
    // share the combine combo: the preview drives both through the same
    // tex0/tex1/interpolation slot.
    const QStringList scenes = QDir( m_root + "/Scene2D" ).entryList( { "*.frag" }, QDir::Files, QDir::Name );
    const QStringList scenes_3d = QDir( m_root + "/Scene3D" ).entryList( { "*.frag" }, QDir::Files, QDir::Name );
    const QStringList combines = QDir( m_root + "/FX" ).entryList( { "*.frag" }, QDir::Files, QDir::Name );
    const QStringList trans = QDir( m_root + "/Transitions" ).entryList( { "*.frag" }, QDir::Files, QDir::Name );
    m_scene3DFiles = scenes_3d;
    m_texCombo->blockSignals( true );
    m_combCombo->blockSignals( true );
    for ( const QString &f : scenes )
        m_texCombo->addItem( f );
    for ( const QString &f : scenes_3d )
        m_texCombo->addItem( f );
    for ( const QString &f : combines )
        m_combCombo->addItem( f );
    // Folder-qualified: a bare transition name would resolve through the
    // preview's Scene2D-first search order (Scene2D/VoronoiShatter.frag
    // shadows Transitions/VoronoiShatter.frag).
    for ( const QString &f : trans )
        m_combCombo->addItem( "Transitions/" + f );
    m_texCombo->model()->sort( 0 );
    m_texCombo->blockSignals( false );
    m_combCombo->blockSignals( false );
    if ( m_combCombo->findText( "FxPlain.frag" ) >= 0 )
        m_combCombo->setCurrentText( "FxPlain.frag" );
}

// Send whatever the "Add current shader to preset" panel currently says for
// type/geom/stateBytes/shadowExtent to the live preview.  Split out of
// onTextureChanged() so the geom/stateBytes/shadowExtent fields can push an
// update on their own, without re-deriving which file is selected.
void EditorWindow::pushPreviewTexture()
{
    const QString f = m_texCombo->currentText();
    if ( f.isEmpty() )
        return;
    m_preview->setTextureShader( f, m_typeCombo->currentText(),
                                 m_geomCombo->currentText(),
                                 m_stateBytesSpin->value(),
                                 m_shadowExtentSpin->value() );
}

void EditorWindow::onTextureChanged()
{
    if ( m_texCombo->currentText().isEmpty() )
        return;
    const QString f = m_texCombo->currentText();
    // Folder tells the type, not the name: KaleidoscopeBase suits the two
    // legacy fullscreen shaders specifically; anything found under Scene3D/
    // is scene3d; everything else defaults to normal.
    if ( isScene3D( f ) )
        m_typeCombo->setCurrentText( "scene3d" );
    else
        m_typeCombo->setCurrentText(
            ( f == "Kaleidoscope.frag" || f == "Tunnel.frag" ) ? "KaleidoscopeBase" : "normal" );
    pushPreviewTexture();
    rebuildParamSliders();
}
void EditorWindow::onCombineChanged()
{
    if ( !m_combCombo->currentText().isEmpty() )
        m_preview->setCombineShader( m_combCombo->currentText() );
    rebuildParamSliders();
}

/// @brief One `<int>`/`<float>` parameter's range as declared for a shader in Komplett.xml.
struct KomplettParam
{
    /// "int" or "float" (the element's tag), deciding whether the slider rounds to whole numbers.
    QString kind, name; ///< Parameter/uniform name (the element's name= attribute).
    /// Declared minValue: the slider's lower end.
    float minV, maxV; ///< Declared maxValue: the slider's upper end.
};
/**
 * @brief Parse a shader's per-activation parameter ranges out of Komplett.xml.
 * @param root Project root directory (Komplett.xml is under root/Presets/).
 * @param frag Bare shader filename to look up (matched against Komplett.xml's file= attribute, folder-agnostic).
 * @return Every `<int>`/`<float>` param's (kind, name, min, max) found in that shader's entry; empty if the shader
 * isn't registered or the file can't be read.
 *
 * Parse a shader's per-activation parameter ranges out of Komplett.xml (the
 * preset that registers EVERY shader with sensible min/max values).
 */
static QVector<KomplettParam> komplettParamsFor( const QString &root, const QString &frag )
{
    QVector<KomplettParam> out;
    QFile                  f( presetsDir( root ) + "/Komplett.xml" );
    if ( !f.open( QIODevice::ReadOnly ) )
        return out;
    const QString      xml = QString::fromUtf8( f.readAll() );
    QRegularExpression entry_re(
        QString(
            "<(?:Texture|Combine)Shader\\b[^>]*file=\"\\.\\.\\\\\\\\(?:\\w+\\\\\\\\)?%1\"[^>]*>(.*?)</(?:Texture|Combine)Shader>" )
            .arg( QRegularExpression::escape( frag ) ),
        QRegularExpression::DotMatchesEverythingOption );
    const QRegularExpressionMatch em = entry_re.match( xml );
    if ( !em.hasMatch() )
        return out;
    QRegularExpression param_re(
        "<(int|float)\\s+name=\"(\\w+)\"\\s+minValue=\"([\\d\\.\\-]+)\"\\s+maxValue=\"([\\d\\.\\-]+)\"" );
    QRegularExpressionMatchIterator it = param_re.globalMatch( em.captured( 1 ) );
    while ( it.hasNext() )
    {
        const QRegularExpressionMatch m = it.next();
        out.push_back( { m.captured( 1 ), m.captured( 2 ),
                         m.captured( 3 ).toFloat(), m.captured( 4 ).toFloat() } );
    }
    return out;
}

void EditorWindow::rebuildParamSliders()
{
    if ( !m_paramForm )
        return;
    // Clear the old rows + slider registry.
    while ( m_paramForm->rowCount() > 0 )
        m_paramForm->removeRow( 0 );
    m_sliders.clear();
    m_preview->setParamOverrides( {} );

    // If the previewed shader IS the table-selected entry, scrub within that
    // entry's own saved range instead of Komplett.xml's default -- so tuning
    // a range in the panel below is immediately visible here, not just after
    // a save+reload.
    const int          sel_row = m_table->currentRow();
    const PresetEntry *sel = ( sel_row >= 0 && sel_row < m_preset.entries.size() )
                                 ? &m_preset.entries[sel_row]
                                 : nullptr;

    auto add_for = [this, sel]( const QString &frag, const QString &prefix, bool fromComb )
    {
        const PresetEntry *e = ( sel && sel->isCombine == fromComb && sel->file == frag ) ? sel : nullptr;
        for ( const KomplettParam &kp : komplettParamsFor( m_root, frag ) )
        {
            SliderInfo si;
            si.name = kp.name;
            si.minV = kp.minV;
            si.maxV = kp.maxV;
            si.isInt = ( kp.kind == "int" );
            si.fromCombine = fromComb;
            if ( e )
                for ( const ShaderParam &p : e->params )
                    if ( p.name == kp.name && p.kind == kp.kind )
                    {
                        si.minV = p.minValue.toFloat();
                        si.maxV = p.maxValue.toFloat();
                        break;
                    }
            QSlider *s = new QSlider( Qt::Horizontal );
            s->setRange( 0, 1000 );
            s->setValue( 500 );
            si.slider = s;
            m_sliders.push_back( si );
            m_paramForm->addRow( prefix + kp.name, s );
            connect( s, &QSlider::valueChanged, this, [this]
            { pushParamOverrides(); } );
        }
    };
    add_for( m_texCombo->currentText(), "", false );
    add_for( m_combCombo->currentText(), "C: ", true );
    m_paramBox->setVisible( !m_sliders.isEmpty() );
    pushParamOverrides();
}

void EditorWindow::pushParamOverrides()
{
    QVector<PreviewWidget::ParamOverride> ov;
    for ( const SliderInfo &si : m_sliders )
    {
        float t = si.slider->value() / 1000.f;
        ov.push_back( { si.name, si.minV + t * ( si.maxV - si.minV ), si.isInt } );
    }
    m_preview->setParamOverrides( std::move( ov ) );
}

// Dice: throw every slider to a random position (live preview follows).
void EditorWindow::randomizeParams()
{
    for ( const SliderInfo &si : m_sliders )
        si.slider->setValue( QRandomGenerator::global()->bounded( 1001 ) );
}

// Freeze: write the current slider values into the table-selected preset entry
// as min=max parameters (the engine rolls min when min==max -> a fixed look).
void EditorWindow::freezeParamsIntoEntry()
{
    const int row = m_table->currentRow();
    if ( row < 0 || row >= m_preset.entries.size() )
    {
        m_status->setText( "Festwerte: bitte zuerst einen Eintrag in der Tabelle wählen" );
        return;
    }
    PresetEntry  &e = m_preset.entries[row];
    const QString tex_file = m_texCombo->currentText();
    const QString comb_file = m_combCombo->currentText();
    const bool    matches_tex = ( !e.isCombine && e.file == tex_file );
    const bool    matches_comb = ( e.isCombine && e.file == comb_file );
    if ( !matches_tex && !matches_comb )
    {
        m_status->setText( "Festwerte: der gewählte Eintrag ("
                           + e.file + ") passt nicht zum Preview-Shader" );
        return;
    }

    int written = 0;
    for ( const SliderInfo &si : m_sliders )
    {
        if ( si.fromCombine != e.isCombine )
            continue;
        float       t = si.slider->value() / 1000.f;
        float       v = si.minV + t * ( si.maxV - si.minV );
        QString     vs = si.isInt ? QString::number( int( v + 0.5f ) )
                                  : QString::number( v, 'f', 3 );
        ShaderParam sp;
        sp.kind = si.isInt ? "int" : "float";
        sp.name = si.name;
        sp.minValue = vs;
        sp.maxValue = vs;
        // Replace an existing param of the same name, else append.
        bool replaced = false;
        for ( ShaderParam &old : e.params )
            if ( old.name == si.name )
            {
                old = sp;
                replaced = true;
                break;
            }
        if ( !replaced )
            e.params.push_back( sp );
        ++written;
    }
    refreshTable();
    m_table->selectRow( row );
    m_status->setText( QString( "Festwerte: %1 Parameter in '%2' geschrieben "
                                "(min = max; Save nicht vergessen)" )
                           .arg( written )
                           .arg( e.file ) );
}

QVector<ShaderParam> EditorWindow::defaultParamsFor( const QString &f ) const
{
    for ( const PresetEntry &e : m_komplett.entries )
        if ( e.file == f )
            return e.params;
    return {};
}

void EditorWindow::addTextureEntry()
{
    if ( m_texCombo->currentText().isEmpty() )
        return;
    PresetEntry e;
    e.isCombine = false;
    e.file = m_texCombo->currentText();
    e.type = m_typeCombo->currentText();
    if ( e.type == "scene3d" )
    {
        e.geom = m_geomCombo->currentText();
        e.stateBytes = m_stateBytesSpin->value();
        e.shadowExtent = m_shadowExtentSpin->value();
    }
    e.minTimeSolo = m_minSolo->value();
    e.maxTimeSolo = m_maxSolo->value();
    e.minTimeInterpolation = m_minInterp->value();
    e.maxTimeInterpolation = m_maxInterp->value();
    e.probability = m_prob->value();
    e.complexity = m_complex->value();
    e.params = defaultParamsFor( e.file );
    m_preset.entries.push_back( e );
    refreshTable();
}
void EditorWindow::addCombineEntry()
{
    if ( m_combCombo->currentText().isEmpty() )
        return;
    PresetEntry e;
    e.isCombine = true;
    e.file = m_combCombo->currentText();
    e.type = "normal";
    e.minTimeSolo = m_minSolo->value();
    e.maxTimeSolo = m_maxSolo->value();
    e.minTimeInterpolation = m_minInterp->value();
    e.maxTimeInterpolation = m_maxInterp->value();
    e.probability = m_prob->value();
    e.complexity = m_complex->value();
    e.params = defaultParamsFor( e.file );
    m_preset.entries.push_back( e );
    refreshTable();
}

void EditorWindow::removeSelectedEntry()
{
    int row = m_table->currentRow();
    if ( row < 0 || row >= m_preset.entries.size() )
        return;
    m_preset.entries.remove( row );
    refreshTable();
}

void EditorWindow::onTableSelectionChanged()
{
    rebuildRangeEditor();
    int row = m_table->currentRow();
    if ( row < 0 || row >= m_preset.entries.size() )
        return;
    const PresetEntry &e = m_preset.entries[row];
    // Preview the selected entry + mirror its settings into the add-controls.
    if ( e.isCombine )
        m_combCombo->setCurrentText( e.file );
    else
        m_texCombo->setCurrentText( e.file );
    m_typeCombo->setCurrentText( e.type );
    if ( e.type == "scene3d" )
    {
        if ( !e.geom.isEmpty() )
            m_geomCombo->setCurrentText( e.geom );
        m_stateBytesSpin->setValue( e.stateBytes );
        m_shadowExtentSpin->setValue( e.shadowExtent );
    }
    m_minSolo->setValue( e.minTimeSolo );
    m_maxSolo->setValue( e.maxTimeSolo );
    m_minInterp->setValue( e.minTimeInterpolation );
    m_maxInterp->setValue( e.maxTimeInterpolation );
    m_prob->setValue( e.probability );
    m_complex->setValue( e.complexity );
    // m_texCombo->setCurrentText() above already re-fired onTextureChanged()
    // (or is a no-op if the text was already current); either way the geom/
    // stateBytes/shadowExtent values just restored need their own push, since
    // onTextureChanged() ran BEFORE this function set them.
    if ( !e.isCombine )
        pushPreviewTexture();
}

/**
 * @brief Find the ExprVars formula variable that corresponds 1:1 to an audio* uniform.
 * @param uniform Uniform name, e.g. "audioKick" or "audioZCR".
 * @return The matching ExprVars variable name (e.g. "kick"), or empty if the formula layer has no equivalent.
 *
 * The ExprVars identity variable for an audio uniform ("audioKick" -> "kick"),
 * or empty if the formula layer has no equivalent.  Shown as the placeholder
 * of an unmapped audio row, so authoring an override starts from the variable
 * that carries (almost) the same value the raw upload would.
 */
static QString identityVarFor( const QString &uniform )
{
    QString v = uniform.mid( 5 ); // strip the "audio" prefix
    if ( v.isEmpty() )
        return {};
    if ( v == "ZCR" )
        v = "zcr";
    else
        v[0] = v[0].toLower();
    const char *const *names = ExprVars::names();
    for ( int i = 0; i < ExprVars::V_COUNT; ++i )
        if ( v == QLatin1String( names[i] ) )
            return v;
    return {};
}

/**
 * @brief Resolve the shader source file(s) that make up a preset entry.
 * @param root Project root directory.
 * @param e Entry whose shader source file path(s) to resolve.
 * @return Absolute path(s) of the entry's shader source: one .frag for a 2D scene/combine, or every
 * Scene3D/&lt;stem&gt;.{frag,vert,comp,tesc,tese,geom} candidate for a scene3d entry (used by usedAudioUniforms() and
 * dormantFloatUniforms() to scan for uniform declarations).
 *
 * Every SCALAR audio uniform the entry's shader stages actually read -- these
 * are the mapping targets the panel offers.  Reading the sources (rather than
 * some registry) means the list is always true for the shader as it is NOW,
 * mid-edit included.  Array/vec uniforms are excluded: a formula evaluates to
 * one float.
 * Shader source files of an entry (frag only for 2D, all stages for Scene3D).
 * PresetEntry.file is the BARE name; the folder comes from e.folder (parsed
 * from the file= attribute at load), with the isFX/type inference as the
 * fallback for entries created in the GUI before their first save.
 */
static QStringList shaderSourceFiles( const QString &root, const PresetEntry &e )
{
    QString folder = e.folder;
    if ( folder.isEmpty() )
        folder = e.isCombine ? QStringLiteral( "FX" )
                             : ( e.type.compare( "scene3d", Qt::CaseInsensitive ) == 0
                                     ? QStringLiteral( "Scene3D" )
                                     : QStringLiteral( "Scene2D" ) );
    const QString stem = QFileInfo( e.file ).completeBaseName();
    QStringList   files;
    if ( folder.compare( "Scene3D", Qt::CaseInsensitive ) == 0 )
        for ( const char *ext : { ".frag", ".vert", ".comp", ".tesc", ".tese", ".geom" } )
            files << root + "/Scene3D/" + stem + ext;
    else
        files << root + "/" + folder + "/" + stem + ".frag";
    return files;
}

/**
 * @brief Find float uniforms a shader declares that neither the engine nor any existing param row supplies.
 * @param root Project root directory.
 * @param e Entry whose shader source(s) to scan.
 * @param covered Parameter names already covered by an existing row in the range editor (skipped even if otherwise
 * dormant).
 * @return Sorted list of declared `uniform float` names that are not in the host-supplied set (Host), not already
 * covered, and not an audio* uniform.
 *
 * All scalar float uniforms the entry's shaders DECLARE that the host never
 * supplies and no param row covers: dormant knobs, sitting at GLSL's 0.0
 * default in the shipped app.  Each becomes a formula-mapping row, so music
 * can drive them per preset without any shader edit.
 */
static QStringList dormantFloatUniforms( const QString &root, const PresetEntry &e,
                                         const QSet<QString> &covered )
{
    // Host-supplied names (kAudioLocNames in EffectShader.cpp + the fixed
    // engine set).  Anything here is uploaded every frame by the engine and
    // gets its mapping row from the AUDIO section (audio*) or nowhere.
    static const QSet<QString> Host = {
        "audioPhase", "audioAdvance", "audioBeat", "audioLevel", "sides",
        "audioFlip", "audioCentroid", "audioFlux", "audioSubBass", "audioBass",
        "audioLowMid", "audioMid", "audioUpperMid", "audioHigh", "audioRolloff",
        "audioSpread", "audioMode", "audioPitch", "audioArousal", "audioValence",
        "audioHarmChange", "audioRoughness", "audioSharpness", "audioOnset",
        "audioDownbeat", "audioBeatPhase", "audioStereo", "audioDeltaPitch",
        "audioMusic", "audioStereoL", "audioStereoR", "audioChromaHue",
        "audioSwell", "audioBarPhase", "audioAmbient", "audioKick", "audioSnare",
        "audioHat", "transStyle", "audioSpectrum", "texSim", "texFluid",
        "audioBuildUp", "audioDrop", "audioWave", "audioBassRel", "audioMidRel",
        "audioTrebRel", "dayPhase", "texSmoke3D", "audioChroma", "audioFlatness",
        "audioZCR", "texSSM", "ssmHead", "ssmFill", "texPhysarum",
        "audioFadeOut", "audioMelody", "audioMelodyHead", "audioMelodyPhase",
        "texSpectro", "spectroHead", "spectroFill",
        "texDepth0", "texDepth1", "depthValid", "nearFar", "tanHalfFov",
        "texShadow", "lightM", "shadowPass", "lightDir", "shadowTexel",
        "oitPass", "shadowExtent",
        "time", "resolution", "interpolation", "interpolationRotation",
        "tex0", "tex1", "projM", "maxVertices", "sceneSeed", "cubeBudget",
        // set by C++ code outside the audio path: eyeOff per stereo eye
        // (an override would BREAK stereo), power by the KaleidoscopeBase
        // class, genPass by the Scene3D generator loop
        "eyeOff", "power", "genPass" };
    static const QRegularExpression Decl( "\\buniform\\s+float\\s+(\\w+)\\s*;" );
    QSet<QString>                   found;
    for ( const QString &fp : shaderSourceFiles( root, e ) )
    {
        QFile f( fp );
        if ( !f.open( QIODevice::ReadOnly ) )
            continue;
        const QString src = QString::fromUtf8( f.readAll() );
        auto          it = Decl.globalMatch( src );
        while ( it.hasNext() )
        {
            const QString u = it.next().captured( 1 );
            if ( !Host.contains( u ) && !covered.contains( u )
                 && !u.startsWith( "audio" ) )
                found.insert( u );
        }
    }
    QStringList out = found.values();
    out.sort();
    return out;
}

/**
 * @brief Every scalar audio* uniform the entry's shader source(s) actually reference.
 * @param root Project root directory.
 * @param e Entry whose shader source(s) to scan.
 * @return Sorted, de-duplicated list of `audio*` identifiers found by regex-scanning the shader source (see
 * shaderSourceFiles()), excluding known non-scalar (array/vector) uniforms such as audioSpectrum.
 */
static QStringList usedAudioUniforms( const QString &root, const PresetEntry &e )
{
    static const QSet<QString> NonScalar = {
        "audioSpectrum", "audioWave", "audioChroma", "audioMelody",
        "audioStereoBandL", "audioStereoBandR" };
    QSet<QString>                   found;
    static const QRegularExpression Re( "\\baudio[A-Z]\\w*" );
    for ( const QString &fp : shaderSourceFiles( root, e ) )
    {
        QFile f( fp );
        if ( !f.open( QIODevice::ReadOnly ) )
            continue;
        const QString src = QString::fromUtf8( f.readAll() );
        auto          it = Re.globalMatch( src );
        while ( it.hasNext() )
        {
            const QString u = it.next().captured( 0 );
            if ( !NonScalar.contains( u ) )
                found.insert( u );
        }
    }
    QStringList out = found.values();
    out.sort();
    return out;
}

// Rebuild the "Selected entry: parameter ranges" panel for whatever row is
// currently selected in the table.  Rows come from the UNION of the entry's
// own params (edit their existing value) and Komplett.xml's declared params
// for that shader that the entry doesn't have yet (editing one of THOSE adds
// it to the entry -- the same action fixes an accidentally-missing param).
void EditorWindow::rebuildRangeEditor()
{
    if ( !m_rangeForm )
        return;
    while ( m_rangeForm->rowCount() > 0 )
        m_rangeForm->removeRow( 0 );
    m_exprRows.clear(); // widgets just destroyed by removeRow(); drop the now-dangling pointers

    const int row = m_table->currentRow();
    if ( row < 0 || row >= m_preset.entries.size() )
    { // no selection: keep the box visible and show the how-to placeholder
        m_rangeHint->setText( rangeHowToText() );
        m_rangeHint->setVisible( true );
        m_preview->setSceneExprs( {} );
        return;
    }
    m_rangeHint->setVisible( false );
    const PresetEntry &entry = m_preset.entries[row];

    struct Row
    {
        ShaderParam param;
        bool        present;
    };
    QVector<Row> combined;
    for ( const ShaderParam &p : entry.params )
        combined.push_back( { p, true } );
    for ( const ShaderParam &kp : defaultParamsFor( entry.file ) )
    {
        // Match on (name, kind): a shader can carry an `<expr>` AND a `<float>`
        // of the same name (formula + declared clamp range), so a same-named
        // param of a DIFFERENT kind must not hide this one from the panel.
        bool have = false;
        for ( const Row &r : combined )
            if ( r.param.name == kp.name && r.param.kind == kp.kind )
            {
                have = true;
                break;
            }
        if ( !have )
            combined.push_back( { kp, false } );
    }
    // ---- AUDIO-MAPPING: every scalar audio uniform the shader's sources
    // actually READ becomes an editable formula row.  An empty row means the
    // engine's raw value (exactly today's behaviour); a formula writes an
    // <expr name="audioX"> override into this entry, which the formula layer
    // evaluates AFTER the raw upload and per scene -- so the coupling is no
    // longer hardwired in GLSL, without touching any shader.
    for ( const QString &au : usedAudioUniforms( m_root, entry ) )
    {
        bool have = false;
        for ( const Row &r : combined )
            if ( r.param.name == au && r.param.kind == "expr" )
            {
                have = true;
                break;
            }
        if ( have )
            continue;
        ShaderParam ap;
        ap.kind = "expr";
        ap.name = au; // empty formula = raw
        combined.push_back( { ap, false } );
    }
    // ---- FREE FORMULA MAPPING: every FLOAT param additionally gets a formula
    // row, so ANY tunable uniform can be driven by ANY audio variable -- not
    // just remapped audio uniforms.  Float only: the formula layer uploads
    // via glUniform1f, which is a GL error on an int/bool uniform.
    {
        const int n = combined.size(); // don't iterate the rows we append
        for ( int i = 0; i < n; ++i )
        {
            if ( combined[i].param.kind != "float" )
                continue;
            const QString &nm = combined[i].param.name;
            bool           have = false;
            for ( const Row &r : combined )
                if ( r.param.name == nm && r.param.kind == "expr" )
                {
                    have = true;
                    break;
                }
            if ( have )
                continue;
            ShaderParam fp;
            fp.kind = "expr";
            fp.name = nm; // empty = random-in-range
            combined.push_back( { fp, false } );
        }
    }
    // ---- DORMANT UNIFORMS: float uniforms the shaders declare that neither
    // the host nor any registered param supplies -- they sit at GLSL's 0.0
    // default in the shipped app.  A formula row wakes them per preset.
    {
        QSet<QString> covered;
        for ( const Row &r : combined )
            covered.insert( r.param.name );
        for ( const QString &du : dormantFloatUniforms( m_root, entry, covered ) )
        {
            ShaderParam dp;
            dp.kind = "expr";
            dp.name = du; // empty = 0.0
            combined.push_back( { dp, false } );
        }
    }
    // ---- CAMERA RIG (scene3d only): 8 formula channels Scene3DShader
    // composes into projM -- pitch/yaw/roll (radians), dolly (world units,
    // >0 = closer) plus host-INTEGRATED V rates (audio-varying rates are
    // jump-free by construction).  Empty = rig off.
    {
        // scene3d gets the projM rig; every OTHER texture scene gets the 2D
        // rig (RenderPipeline's Rig2D transform pass).  Combines get neither.
        static const char *Rig3[8] = { "rigPitch", "rigYaw", "rigRoll", "rigDolly",
                                       "rigPitchV", "rigYawV", "rigRollV", "rigDollyV" };
        static const char *Rig2[8] = { "rig2Roll", "rig2Zoom", "rig2X", "rig2Y",
                                       "rig2RollV", "rig2ZoomV", "rig2XV", "rig2YV" };
        const bool         is_3d = entry.type.compare( "scene3d", Qt::CaseInsensitive ) == 0;
        const char *const *rig = is_3d ? Rig3 : Rig2;
        if ( !entry.isCombine )
            for ( int ri = 0; ri < 8; ++ri )
            {
                bool have = false;
                for ( const Row &r : combined )
                    if ( r.param.kind == "expr" && r.param.name == QLatin1String( rig[ri] ) )
                    {
                        have = true;
                        break;
                    }
                if ( have )
                    continue;
                ShaderParam rp;
                rp.kind = "expr";
                rp.name = rig[ri];
                combined.push_back( { rp, false } );
            }
    }
    // Order: value rows, then param-formula rows, then audio-mapping rows --
    // each formula group under its own section header below.
    std::stable_sort( combined.begin(), combined.end(),
                      []( const Row &a, const Row &b )
    {
        auto rank = []( const Row &r )
        {
            if ( r.param.kind != "expr" )
                return 0;
            return r.param.name.startsWith( "audio" ) ? 2 : 1;
        };
        return rank( a ) < rank( b );
    } );

    // Interpolator params (rare -- one use in the whole catalogue) have no
    // dedicated control here; they round-trip untouched via e.params.
    combined.erase( std::remove_if( combined.begin(), combined.end(),
                                    []( const Row &r )
    { return r.param.kind == "interpolator"; } ),
                    combined.end() );
    // Box stays visible even for a (rare) parameter-less entry -- an
    // appearing/disappearing panel is exactly what made this undiscoverable.
    if ( combined.isEmpty() )
    {
        m_rangeHint->setText( tr( "Dieser Eintrag hat keine einstellbaren "
                                  "Parameter und liest keine skalaren "
                                  "audio*-Uniforms." ) );
        m_rangeHint->setVisible( true );
        return;
    }

    // Pushes the entry's SAVED formula layer (own exprs first, then Komplett
    // defaults it hasn't overridden) into the preview, so the rendered image
    // follows the committed formulas -- incl. audio-mapping overrides.
    auto push_scene_exprs = [this, row]()
    {
        if ( row < 0 || row >= m_preset.entries.size() )
        {
            m_preview->setSceneExprs( {} );
            return;
        }
        const PresetEntry               &ent = m_preset.entries[row];
        QVector<QPair<QString, QString>> ex;
        QSet<QString>                    have;
        for ( const ShaderParam &p : ent.params )
            if ( p.kind == "expr" && !p.formula.trimmed().isEmpty() )
            {
                ex.push_back( { p.name, p.formula } );
                have.insert( p.name );
            }
        for ( const ShaderParam &kp : defaultParamsFor( ent.file ) )
            if ( kp.kind == "expr" && !have.contains( kp.name )
                 && !kp.formula.trimmed().isEmpty() )
                ex.push_back( { kp.name, kp.formula } );
        m_preview->setSceneExprs( std::move( ex ) );
    };

    // Writes (or creates) the named param in m_preset.entries[row], then
    // refreshes the preview sliders so the new band is immediately visible.
    auto write_param = [this, row, push_scene_exprs]( const QString &name, const QString &kind,
                                                      const QString &minV, const QString &maxV,
                                                      const QString &prob, const QString &formula )
    {
        if ( row < 0 || row >= m_preset.entries.size() )
            return;
        PresetEntry &ent = m_preset.entries[row];
        ShaderParam *t = nullptr;
        // (name, kind) match: an `<expr>` and a `<float>` of the same name are
        // two independent params -- a name-only match would write the expr's
        // formula onto the FLOAT param (whichever comes first in the list).
        for ( ShaderParam &p : ent.params )
            if ( p.name == name && p.kind == kind )
            {
                t = &p;
                break;
            }
        if ( !t )
        {
            ShaderParam np;
            np.kind = kind;
            np.name = name;
            ent.params.push_back( np );
            t = &ent.params.back();
        }
        if ( kind == "bool" )
            t->probability = prob;
        else if ( kind == "int" || kind == "float" )
        {
            t->minValue = minV;
            t->maxValue = maxV;
        }
        else if ( kind == "expr" )
            t->formula = formula;
        rebuildParamSliders();
        push_scene_exprs();
    };

    // Removes the named param again -- an audio-mapping row cleared back to
    // empty means "raw engine value", which is the ABSENCE of the override,
    // not an override with an empty formula.
    auto remove_param = [this, row, push_scene_exprs]( const QString &name, const QString &kind )
    {
        if ( row < 0 || row >= m_preset.entries.size() )
            return;
        PresetEntry &ent = m_preset.entries[row];
        for ( int i = 0; i < ent.params.size(); ++i )
            if ( ent.params[i].name == name && ent.params[i].kind == kind )
            {
                ent.params.removeAt( i );
                break;
            }
        rebuildParamSliders();
        push_scene_exprs();
    };

    bool audio_header_done = false, expr_header_done = false;
    for ( const Row &r : combined )
    {
        const ShaderParam &p = r.param;
        const bool         is_audio_map = ( p.kind == "expr" && p.name.startsWith( "audio" ) );
        if ( is_audio_map && !audio_header_done )
        {
            audio_header_done = true;
            QLabel *head = new QLabel( tr( "<b>Audio-Mapping</b>" ) );
            QLabel *hint = new QLabel( tr( "leer = Standardwert der Engine" ) );
            hint->setStyleSheet( "color: #888;" );
            m_rangeForm->addRow( head, hint );
        }
        else if ( p.kind == "expr" && !is_audio_map && !expr_header_done )
        {
            expr_header_done = true;
            QLabel *head = new QLabel( tr( "<b>Formel-Mapping</b>" ) );
            QLabel *hint = new QLabel( tr( "Formel ersetzt den Zufallswert; leer = Zufallswert aus Bereich" ) );
            hint->setStyleSheet( "color: #888;" );
            m_rangeForm->addRow( head, hint );
        }
        QLabel *label = new QLabel( p.name + "  [" + p.kind + "]" );
        if ( is_audio_map )
            label->setToolTip( tr( "Audio-Uniform, die dieser Shader liest. Formel ersetzt "
                                   "den rohen Engine-Wert pro Szene (z.B. \"0.5*kick+0.5*snare\" "
                                   "oder eine Konstante). Leeren = Standard." ) );
        else if ( !r.present )
            label->setToolTip( "Fehlt in diesem Preset-Eintrag (Komplett.xml-Default gezeigt); "
                               "Aendern fuegt den Parameter hinzu." );
        if ( p.kind == "bool" )
        {
            QDoubleSpinBox *prob = new QDoubleSpinBox();
            prob->setRange( 0.0, 1.0 );
            prob->setSingleStep( 0.05 );
            prob->setDecimals( 2 );
            prob->setValue( p.probability.isEmpty() ? 0.5 : p.probability.toDouble() );
            connect( prob, QOverload<double>::of( &QDoubleSpinBox::valueChanged ), this,
                     [=]( double v )
            { write_param( p.name, "bool", {}, {}, QString::number( v, 'f', 2 ), {} ); } );
            m_rangeForm->addRow( label, prob );
        }
        else if ( p.kind == "int" || p.kind == "float" )
        {
            const bool      is_int = ( p.kind == "int" );
            QDoubleSpinBox *lo = new QDoubleSpinBox(), *hi = new QDoubleSpinBox();
            for ( QDoubleSpinBox *s : { lo, hi } )
            {
                s->setRange( -1.0e6, 1.0e6 );
                s->setDecimals( is_int ? 0 : 4 );
                s->setSingleStep( is_int ? 1.0 : 0.01 );
            }
            lo->setValue( p.minValue.toDouble() );
            hi->setValue( p.maxValue.toDouble() );
            auto fmt = [is_int]( double v )
            { return is_int ? QString::number( int( v ) )
                            : QString::number( v, 'f', 4 ); };
            auto apply = [=]
            { write_param( p.name, p.kind, fmt( lo->value() ), fmt( hi->value() ), {}, {} ); };
            connect( lo, QOverload<double>::of( &QDoubleSpinBox::valueChanged ), this, apply );
            connect( hi, QOverload<double>::of( &QDoubleSpinBox::valueChanged ), this, apply );
            QWidget     *host = new QWidget();
            QHBoxLayout *hl = new QHBoxLayout( host );
            hl->setContentsMargins( 0, 0, 0, 0 );
            hl->addWidget( new QLabel( "min" ) );
            hl->addWidget( lo );
            hl->addWidget( new QLabel( "max" ) );
            hl->addWidget( hi );
            m_rangeForm->addRow( label, host );
        }
        else if ( p.kind == "expr" )
        {
            QLineEdit *edit = new QLineEdit( p.formula );
            // Komplett.xml's default formula for this name, if any: --validate
            // requires Komplett-declared exprs to be PRESENT in every preset
            // entry, so clearing such a row restores the default instead of
            // removing the param.
            QString def_formula;
            if ( !is_audio_map )
                for ( const ShaderParam &kp : defaultParamsFor( entry.file ) )
                    if ( kp.kind == "expr" && kp.name == p.name )
                    {
                        def_formula = kp.formula;
                        break;
                    }
            if ( is_audio_map )
            {
                // Show WHAT the raw engine value would be as the placeholder:
                // for most uniforms the identically-named formula variable
                // (audioKick -> "kick"), so typing the placeholder text is a
                // valid starting point to tweak from.
                const QString iv = identityVarFor( p.name );
                edit->setPlaceholderText( iv.isEmpty() ? tr( "Engine-Rohwert" )
                                                       : iv + tr( "   (Engine-Rohwert)" ) );
            }
            else if ( def_formula.isEmpty() )
            {
                // Distinguish: rig channel / ranged param (empty = the usual
                // random roll) / dormant uniform (empty = GLSL 0.0).
                bool has_range = false;
                for ( const Row &r2 : combined )
                    if ( r2.param.name == p.name
                         && ( r2.param.kind == "float" || r2.param.kind == "int" ) )
                    {
                        has_range = true;
                        break;
                    }
                if ( p.name.startsWith( "rig" ) )
                    edit->setPlaceholderText( p.name.endsWith( "V" )
                                                  ? tr( "Rate, wird integriert – z.B. 0.1*swell   (leer = Rig aus)" )
                                                  : tr( "z.B. 0.05*sin(0.2*phase)   (leer = Rig aus)" ) );
                else
                    edit->setPlaceholderText( has_range
                                                  ? tr( "z.B. 1.0 + 0.5*kick   (leer = Zufallswert aus Bereich)" )
                                                  : tr( "z.B. 0.5*swell   (leer = 0.0, Uniform ungenutzt)" ) );
            }
            connect( edit, &QLineEdit::editingFinished, this, [=]
            {
                if ( !edit->text().trimmed().isEmpty() )
                    write_param( p.name, "expr", {}, {}, {}, edit->text() );
                else if ( !def_formula.isEmpty() )
                { // Komplett declares this formula: restore the default
                    edit->setText( def_formula );
                    write_param( p.name, "expr", {}, {}, {}, def_formula );
                }
                else
                    remove_param( p.name, "expr" ); // absence = engine default
            } );
            // Variable picker: ExprEval.h documents ~38 audio-derived names
            // (bassRel, chromaHue, beatPhase, seed1, ...) but nothing in the
            // editor ever listed them -- authoring a formula meant already
            // knowing the exact spelling. Selecting one INSERTS it at the
            // cursor (formulas are combinations like "chromaHue + seed1*1.5",
            // not single tokens), then resets to the placeholder so it can be
            // used again for the next variable in the same formula.
            QComboBox *var_pick = new QComboBox();
            var_pick->addItem( tr( "Variable einfügen…" ) );
            const char *const *names = ExprVars::names();
            for ( int i = 0; i < ExprVars::V_COUNT; ++i )
                var_pick->addItem( names[i] );
            connect( var_pick, QOverload<int>::of( &QComboBox::currentIndexChanged ), this,
                     [=]( int idx )
            {
                if ( idx <= 0 )
                    return;
                edit->insert( var_pick->itemText( idx ) );
                edit->setFocus();
                var_pick->setCurrentIndex( 0 );
                write_param( p.name, "expr", {}, {}, {}, edit->text() );
            } );
            // Live readout: shows what the formula currently evaluates to
            // (against the synthesized audio state -- see
            // PreviewWidget::evalExpr()) and turns red instead of quietly
            // evaluating to 0 on a typo. Recompiled on every keystroke, kept
            // separate from the write_param() commit on editingFinished so a
            // half-typed formula isn't written into the preset yet.
            QLabel *value_lbl = new QLabel();
            value_lbl->setMinimumWidth( 64 );
            value_lbl->setAlignment( Qt::AlignRight | Qt::AlignVCenter );
            const int row_idx = m_exprRows.size();
            m_exprRows.push_back( { edit, value_lbl, nullptr } );
            auto recompile = [this, row_idx]()
            {
                if ( row_idx >= m_exprRows.size() )
                    return; // stale (panel rebuilt meanwhile)
                ExprRow &er = m_exprRows[row_idx];
                if ( er.edit->text().trimmed().isEmpty() )
                { // empty = "raw engine value", a valid state -- never red
                    er.edit->setStyleSheet( QString() );
                    er.edit->setToolTip( QString() );
                    er.prog = nullptr;
                    er.valueLbl->setText( QStringLiteral( "—" ) );
                    return;
                }
                auto        prog = std::make_shared<ExprProgram>();
                std::string err;
                const bool  ok = prog->compile( er.edit->text().toStdString(), "editor", &err );
                er.edit->setStyleSheet( ok ? QString() : "background: #663333;" );
                er.edit->setToolTip( ok ? QString() : QString::fromStdString( err ) );
                er.prog = ok ? prog : nullptr;
                er.valueLbl->setText( ok ? QString::number( m_preview->evalExpr( *prog ), 'f', 3 )
                                         : tr( "Fehler" ) );
            };
            connect( edit, &QLineEdit::textChanged, this, [=]( const QString & )
            { recompile(); } );
            recompile();
            QWidget     *host = new QWidget();
            QHBoxLayout *hl = new QHBoxLayout( host );
            hl->setContentsMargins( 0, 0, 0, 0 );
            hl->addWidget( edit, 1 );
            hl->addWidget( var_pick );
            hl->addWidget( value_lbl );
            m_rangeForm->addRow( label, host );
        }
    }
    push_scene_exprs(); // preview follows the entry's saved formula layer
}

// Re-evaluate every currently-valid `<expr>` row against the animated
// synthetic audio state (the formula text itself only changes on keystrokes;
// its VALUE changes every frame, driven by the preview's Beat/Drone clock).
void EditorWindow::tickExprValues()
{
    for ( const ExprRow &er : m_exprRows )
        if ( er.prog )
            er.valueLbl->setText( QString::number( m_preview->evalExpr( *er.prog ), 'f', 3 ) );
}

void EditorWindow::refreshTable()
{
    m_table->setRowCount( m_preset.entries.size() );
    for ( int i = 0; i < m_preset.entries.size(); ++i )
    {
        const PresetEntry &e = m_preset.entries[i];
        auto               set = [&]( int col, const QString &s )
        { m_table->setItem( i, col, new QTableWidgetItem( s ) ); };
        set( 0, e.isCombine ? "FX" : "Texture" );
        set( 1, e.file );
        set( 2, e.type );
        set( 3, e.geom );
        set( 4, QString::number( e.minTimeSolo ) );
        set( 5, QString::number( e.maxTimeSolo ) );
        set( 6, QString::number( e.minTimeInterpolation ) );
        set( 7, QString::number( e.maxTimeInterpolation ) );
        set( 8, QString::number( e.probability ) );
        set( 9, QString::number( e.complexity ) );
    }
    rebuildRangeEditor();
}

void EditorWindow::metaToUi()
{
    m_nameEdit->setText( m_preset.name );
    m_hiddenCheck->setChecked( m_preset.hidden );
    m_imgDirEdit->setText( m_preset.imageDirectory );
    m_gSoloMin->setValue( m_preset.timeTextureSoloMin );
    m_gSoloMax->setValue( m_preset.timeTextureSoloMax );
    m_gInterpMin->setValue( m_preset.timeTextureInterpolationMin );
    m_gInterpMax->setValue( m_preset.timeTextureInterpolationMax );
    m_preview->setImageDirectory( m_preset.imageDirectory );
    refreshTable();
}
void EditorWindow::uiToMeta()
{
    m_preset.name = m_nameEdit->text().trimmed();
    m_preset.hidden = m_hiddenCheck->isChecked();
    m_preset.imageDirectory = m_imgDirEdit->text();
    m_preset.timeTextureSoloMin = m_gSoloMin->value();
    m_preset.timeTextureSoloMax = m_gSoloMax->value();
    m_preset.timeTextureInterpolationMin = m_gInterpMin->value();
    m_preset.timeTextureInterpolationMax = m_gInterpMax->value();
}

void EditorWindow::newPreset()
{
    Preset keep_dir;
    keep_dir.imageDirectory = m_imgDirEdit->text();
    m_preset = keep_dir;
    metaToUi();
    m_status->setText( "new preset" );
}

void EditorWindow::openPreset()
{
    const QString dir = presetsDir( m_root );
    QString       path = QFileDialog::getOpenFileName( this, "Open preset", dir, "Presets (*.xml)" );
    if ( path.isEmpty() )
        return;
    Preset  p;
    QString err;
    if ( !Preset::load( path, p, &err ) )
    {
        QMessageBox::warning( this, "Open failed", err );
        return;
    }
    m_preset = p;
    metaToUi();
    m_status->setText( "loaded " + QFileInfo( path ).fileName() );
}

void EditorWindow::savePreset()
{
    uiToMeta();
    if ( m_preset.name.isEmpty() )
    {
        QMessageBox::warning( this, "Save", "Please enter a preset name." );
        return;
    }
    const QString dir = presetsDir( m_root );
    QDir().mkpath( dir );
    const QString path = dir + "/" + m_preset.name + ".xml";
    if ( QFileInfo::exists( path )
         && QMessageBox::question( this, "Overwrite?", path + "\nalready exists. Overwrite?" ) != QMessageBox::Yes )
        return;
    QString err;
    if ( !m_preset.save( path, &err ) )
        QMessageBox::warning( this, "Save failed", err );
    else
        m_status->setText( "saved " + path );
}

void EditorWindow::browseImageDir()
{
    QString d = QFileDialog::getExistingDirectory( this, "Image directory", m_imgDirEdit->text() );
    if ( !d.isEmpty() )
    {
        m_imgDirEdit->setText( d );
        m_preview->setImageDirectory( d );
    }
}

void EditorWindow::stepCombo( QComboBox *c, int delta )
{
    int n = c->count();
    if ( n == 0 )
        return;
    c->setCurrentIndex( ( c->currentIndex() + delta + n ) % n );
}

void EditorWindow::keyPressEvent( QKeyEvent *e )
{
    switch ( e->key() )
    {
        case Qt::Key_BracketRight: stepCombo( m_texCombo, +1 ); return;
        case Qt::Key_BracketLeft: stepCombo( m_texCombo, -1 ); return;
        case Qt::Key_Period: stepCombo( m_combCombo, +1 ); return;
        case Qt::Key_Comma: stepCombo( m_combCombo, -1 ); return;
        case Qt::Key_A: addTextureEntry(); return;
        case Qt::Key_C: addCombineEntry(); return;
        case Qt::Key_M: m_musicCombo->setCurrentIndex( 1 - m_musicCombo->currentIndex() ); return;
        case Qt::Key_W: loadAudioWav(); return;
        case Qt::Key_Delete: removeSelectedEntry(); return;
        default: QMainWindow::keyPressEvent( e );
    }
}

// REAL audio preview: pick a WAV, run it through the actual AudioAnalyzer
// (full pipeline, offline, a few seconds), then loop sound + feature timeline
// in the preview.  Picking Cancel while a timeline is active switches back to
// the synthetic profile and stops the sound.
void EditorWindow::loadAudioWav()
{
    const QString path = QFileDialog::getOpenFileName(
        this, "Audio-WAV für die Vorschau (PCM16)", QString(), "WAV (*.wav)" );
    if ( path.isEmpty() )
    {
        if ( m_preview->hasAudioTimeline() )
        {
            PlaySoundW( NULL, NULL, 0 ); // stop looped sound
            m_preview->setAudioTimeline( {} );
            m_status->setText( "Audio preview: back to synthetic profile" );
        }
        return;
    }

    QApplication::setOverrideCursor( Qt::WaitCursor );
    std::vector<AudioFeatures> tl = AudioAnalyzer::analyzeWavToTimeline( path );
    QApplication::restoreOverrideCursor();
    if ( tl.empty() )
    {
        m_status->setText( "Audio preview: could not analyse " + path );
        return;
    }

    m_wavPath = path;
    m_preview->setAudioTimeline( std::move( tl ) );
    // Loop the sound; the preview loops its timeline with the same period.
    PlaySoundW( reinterpret_cast<LPCWSTR>( m_wavPath.utf16() ), NULL,
                SND_FILENAME | SND_ASYNC | SND_LOOP );
    m_status->setText( QString( "Audio preview: %1 (%2 s, echte Analyzer-Features)" )
                           .arg( QFileInfo( path ).fileName() )
                           .arg( m_preview->hasAudioTimeline() ? "loop" : "?" ) );
}
