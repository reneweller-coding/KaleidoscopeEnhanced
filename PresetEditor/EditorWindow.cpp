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
#include <QtCore/QTimer>
#include <QtGui/QKeyEvent>
#include <algorithm>

// Real-analyzer WAV preview: the actual analysis pipeline + looped playback.
#include "../Source/AudioAnalyzer.h"
#include "../Source/ExprEval.h"
#include <windows.h>
#include <mmsystem.h>

static QSpinBox *mkSpin(int lo, int hi, int val)
{
    QSpinBox *s = new QSpinBox(); s->setRange(lo, hi); s->setValue(val); return s;
}

EditorWindow::EditorWindow(const QString &projectRoot, QWidget *parent)
    : QMainWindow(parent), m_root(projectRoot)
{
    setWindowTitle("Kaleidoscope — Preset Editor");
    resize(1180, 760);

    // Reference param set for defaultParamsFor()/rebuildRangeEditor(): loaded
    // once (not per lookup, unlike the regex-based komplettParamsFor() the
    // preview sliders use) because Preset::load() parses real XML via
    // QDomDocument and is comparatively expensive to re-run per keystroke.
    Preset::load(m_root + "/Configurations/Komplett.xml", m_komplett);

    m_preview = new PreviewWidget(m_root);
    connect(m_preview, &PreviewWidget::statusChanged,
            this, [this](const QString &t){ if (m_status) m_status->setText(t); });

    // ---- right-hand control panel ----
    QWidget *panel = new QWidget();
    QVBoxLayout *pl = new QVBoxLayout(panel);

    // Preview selection
    QGroupBox *gSel = new QGroupBox("Preview  (keys: [ ] texture · , . combine · m music)");
    QFormLayout *fSel = new QFormLayout(gSel);
    m_texCombo = new QComboBox();  m_combCombo = new QComboBox();
    fSel->addRow("Texture shader", m_texCombo);
    fSel->addRow("Combine shader", m_combCombo);
    QComboBox *musicCombo = new QComboBox();
    musicCombo->addItems({ "Beat (120 BPM kicks)", "Drone (ambient swells)" });
    fSel->addRow("Music", musicCombo);
    m_musicCombo = musicCombo;
    // REAL audio preview: a WAV is analysed by the actual AudioAnalyzer and
    // its feature timeline (+ the sound, looped) drives the preview.
    QPushButton *bWav = new QPushButton("Audio-WAV…  (w)");
    fSel->addRow("Real audio", bWav);
    pl->addWidget(gSel);

    // Live sliders for the previewed shaders' per-activation parameters
    // (ranges from Komplett.xml; values override the preview defaults).
    m_paramBox = new QGroupBox("Shader-Parameter (Preview)");
    QVBoxLayout *pv = new QVBoxLayout(m_paramBox);
    QWidget *pfHost = new QWidget();
    m_paramForm = new QFormLayout(pfHost);
    m_paramForm->setContentsMargins(0, 0, 0, 0);
    pv->addWidget(pfHost);
    QHBoxLayout *pBtns = new QHBoxLayout();
    QPushButton *bDice   = new QPushButton("Würfeln");
    QPushButton *bFreeze = new QPushButton("Als Festwerte in gewählten Eintrag");
    bDice->setToolTip("Alle Parameter-Slider zufällig setzen");
    bFreeze->setToolTip("Die aktuellen Slider-Werte als min=max-Parameter in den in der "
                        "Tabelle gewählten Preset-Eintrag schreiben");
    pBtns->addWidget(bDice); pBtns->addWidget(bFreeze);
    pv->addLayout(pBtns);
    // Transition test bench: watch ONE of the 25 CombinePlain transition
    // styles in slow motion (interpolation sweeps back and forth, ~10 s).
    QHBoxLayout *tBench = new QHBoxLayout();
    m_transCheck = new QCheckBox("Übergangs-Zeitlupe, Stil:");
    m_transCheck->setToolTip("Überblendung in Zeitlupe hin- und herfahren "
                             "(Stile 0-24; wählt als Combine am besten CombinePlain). "
                             "Headless-Prüfung aller Stile: PresetEditor --transcheck");
    m_transSpin = new QSpinBox();
    m_transSpin->setRange(0, 24);
    tBench->addWidget(m_transCheck);
    tBench->addWidget(m_transSpin);
    tBench->addStretch(1);
    pv->addLayout(tBench);
    auto applyBench = [this] {
        m_preview->setTransTest(m_transCheck->isChecked() ? m_transSpin->value() : -1);
    };
    connect(m_transCheck, &QCheckBox::toggled, this, applyBench);
    connect(m_transSpin, QOverload<int>::of(&QSpinBox::valueChanged), this, applyBench);
    pl->addWidget(m_paramBox);
    connect(bDice,   &QPushButton::clicked, this, &EditorWindow::randomizeParams);
    connect(bFreeze, &QPushButton::clicked, this, &EditorWindow::freezeParamsIntoEntry);

    // Add-to-preset
    QGroupBox *gAdd = new QGroupBox("Add current shader to preset");
    QFormLayout *fAdd = new QFormLayout(gAdd);
    m_typeCombo = new QComboBox();
    m_typeCombo->addItems({ "normal", "KaleidoscopeBase", "scene3d" });
    // scene3d-only fields (geom is required by the engine; stateBytes/
    // shadowExtent are optional, 0 = attribute omitted, matching Configuration.cpp).
    m_geomCombo = new QComboBox();
    m_geomCombo->addItems({ "points", "cubes", "ribbon", "grid", "quads",
                             "patches", "scatter", "indirect" });
    m_stateBytesSpin = mkSpin(0, 8 * 1024 * 1024, 0);
    m_stateBytesSpin->setSpecialValueText("(none)");
    m_shadowExtentSpin = new QDoubleSpinBox();
    m_shadowExtentSpin->setRange(0.0, 500.0);
    m_shadowExtentSpin->setSpecialValueText("(engine default)");
    m_minSolo = mkSpin(0, 100000, 20);   m_maxSolo = mkSpin(0, 100000, 80);
    m_minInterp = mkSpin(0, 100000, 15); m_maxInterp = mkSpin(0, 100000, 50);
    m_prob = new QDoubleSpinBox(); m_prob->setRange(0.0, 1.0); m_prob->setSingleStep(0.05); m_prob->setValue(0.5);
    m_complex = mkSpin(1, 20, 1);
    fAdd->addRow("Type (texture)", m_typeCombo);
    fAdd->addRow("Geom (scene3d)", m_geomCombo);
    fAdd->addRow("stateBytes (scene3d)", m_stateBytesSpin);
    fAdd->addRow("shadowExtent (scene3d)", m_shadowExtentSpin);
    fAdd->addRow("minTimeSolo", m_minSolo);
    fAdd->addRow("maxTimeSolo", m_maxSolo);
    fAdd->addRow("minTimeInterpolation", m_minInterp);
    fAdd->addRow("maxTimeInterpolation", m_maxInterp);
    fAdd->addRow("probability", m_prob);
    fAdd->addRow("complexity", m_complex);
    QHBoxLayout *addBtns = new QHBoxLayout();
    QPushButton *bAddTex = new QPushButton("Add texture effect  (a)");
    QPushButton *bAddComb = new QPushButton("Add combine  (c)");
    addBtns->addWidget(bAddTex); addBtns->addWidget(bAddComb);
    fAdd->addRow(addBtns);
    pl->addWidget(gAdd);

    // Preset contents table
    QGroupBox *gTab = new QGroupBox("Preset contents");
    QVBoxLayout *vTab = new QVBoxLayout(gTab);
    m_table = new QTableWidget(0, 10);
    m_table->setHorizontalHeaderLabels(
        { "Kind", "File", "Type", "Geom", "SoloMin", "SoloMax", "IntMin", "IntMax", "Prob", "Cplx" });
    m_table->horizontalHeader()->setSectionResizeMode(1, QHeaderView::Stretch);
    m_table->setSelectionBehavior(QAbstractItemView::SelectRows);
    m_table->setEditTriggers(QAbstractItemView::NoEditTriggers);
    vTab->addWidget(m_table);
    QPushButton *bRemove = new QPushButton("Remove selected  (Del)");
    vTab->addWidget(bRemove);
    pl->addWidget(gTab, 1);

    // Per-entry parameter range editor: lets the SELECTED table row deviate
    // from Komplett.xml's default range deliberately (different min/max per
    // preset, not just a different probability) -- select a row to populate.
    m_rangeBox = new QGroupBox("Selected entry: parameter ranges");
    QVBoxLayout *rv = new QVBoxLayout(m_rangeBox);
    QWidget *rfHost = new QWidget();
    m_rangeForm = new QFormLayout(rfHost);
    m_rangeForm->setContentsMargins(0, 0, 0, 0);
    rv->addWidget(rfHost);
    m_rangeBox->setVisible(false);
    pl->addWidget(m_rangeBox);

    // Preset metadata + file actions
    QGroupBox *gMeta = new QGroupBox("Preset");
    QFormLayout *fMeta = new QFormLayout(gMeta);
    m_nameEdit = new QLineEdit("MyPreset");
    m_imgDirEdit = new QLineEdit();
    QPushButton *bBrowse = new QPushButton("…");
    QHBoxLayout *imgRow = new QHBoxLayout(); imgRow->addWidget(m_imgDirEdit); imgRow->addWidget(bBrowse);
    m_gSoloMin = mkSpin(0, 100000, 10);  m_gSoloMax = mkSpin(0, 100000, 40);
    m_gInterpMin = mkSpin(0, 100000, 20); m_gInterpMax = mkSpin(0, 100000, 80);
    fMeta->addRow("Name", m_nameEdit);
    fMeta->addRow("ImageDirectory", imgRow);
    fMeta->addRow("timeTextureSoloMin", m_gSoloMin);
    fMeta->addRow("timeTextureSoloMax", m_gSoloMax);
    fMeta->addRow("timeTextureInterpolationMin", m_gInterpMin);
    fMeta->addRow("timeTextureInterpolationMax", m_gInterpMax);
    QHBoxLayout *fileBtns = new QHBoxLayout();
    QPushButton *bNew = new QPushButton("New");
    QPushButton *bOpen = new QPushButton("Open…");
    QPushButton *bSave = new QPushButton("Save");
    fileBtns->addWidget(bNew); fileBtns->addWidget(bOpen); fileBtns->addWidget(bSave);
    fMeta->addRow(fileBtns);
    pl->addWidget(gMeta);

    QScrollArea *scroll = new QScrollArea();
    scroll->setWidget(panel);
    scroll->setWidgetResizable(true);
    scroll->setMinimumWidth(430);
    scroll->setMaximumWidth(520);

    QSplitter *split = new QSplitter();
    split->addWidget(m_preview);
    split->addWidget(scroll);
    split->setStretchFactor(0, 1);
    setCentralWidget(split);

    m_status = new QLabel("ready");
    statusBar()->addWidget(m_status);

    // ---- wiring ----
    connect(m_texCombo,  &QComboBox::currentTextChanged, this, &EditorWindow::onTextureChanged);
    connect(m_combCombo, &QComboBox::currentTextChanged, this, &EditorWindow::onCombineChanged);
    // Tuning geom/stateBytes/shadowExtent for the CURRENTLY previewed scene3d
    // shader should update the live preview immediately, the same way the
    // parameter sliders already do -- otherwise the fields would look inert
    // until the next unrelated preview refresh.
    connect(m_geomCombo, &QComboBox::currentTextChanged, this, [this]{
        if (isScene3D(m_texCombo->currentText())) pushPreviewTexture();
    });
    connect(m_stateBytesSpin, QOverload<int>::of(&QSpinBox::valueChanged), this, [this]{
        if (isScene3D(m_texCombo->currentText())) pushPreviewTexture();
    });
    connect(m_shadowExtentSpin, QOverload<double>::of(&QDoubleSpinBox::valueChanged), this, [this]{
        if (isScene3D(m_texCombo->currentText())) pushPreviewTexture();
    });
    connect(musicCombo, &QComboBox::currentIndexChanged, this, [this](int i){
        m_preview->setMusicMode(i == 1 ? PreviewWidget::Drone : PreviewWidget::Beat);
    });
    connect(bAddTex,  &QPushButton::clicked, this, &EditorWindow::addTextureEntry);
    connect(bAddComb, &QPushButton::clicked, this, &EditorWindow::addCombineEntry);
    connect(bRemove,  &QPushButton::clicked, this, &EditorWindow::removeSelectedEntry);
    connect(m_table,  &QTableWidget::itemSelectionChanged, this, &EditorWindow::onTableSelectionChanged);
    connect(bNew,  &QPushButton::clicked, this, &EditorWindow::newPreset);
    connect(bOpen, &QPushButton::clicked, this, &EditorWindow::openPreset);
    connect(bSave, &QPushButton::clicked, this, &EditorWindow::savePreset);
    connect(bBrowse, &QPushButton::clicked, this, &EditorWindow::browseImageDir);
    connect(bWav,    &QPushButton::clicked, this, &EditorWindow::loadAudioWav);

    m_exprTimer = new QTimer(this);
    connect(m_exprTimer, &QTimer::timeout, this, &EditorWindow::tickExprValues);
    m_exprTimer->start(150);

    scanShaders();
    metaToUi();
    onTextureChanged();
    onCombineChanged();
}

void EditorWindow::scanShaders()
{
    // Since the 2026-07 reorg the user-selectable shaders live in Scene/,
    // Scene3D/ and Combine/ (Blend/ holds the internal pipeline passes and is
    // not listed).  Scene3D shaders share the texture-shader combo with the
    // 2D ones -- onTextureChanged() tells them apart by which folder they
    // were actually found in (m_scene3DFiles), not by any naming convention.
    const QStringList scenes    = QDir(m_root + "/Scene").entryList(
                                      { "*.frag" }, QDir::Files, QDir::Name);
    const QStringList scenes3D  = QDir(m_root + "/Scene3D").entryList(
                                      { "*.frag" }, QDir::Files, QDir::Name);
    const QStringList combines  = QDir(m_root + "/Combine").entryList(
                                      { "*.frag" }, QDir::Files, QDir::Name);
    m_scene3DFiles = scenes3D;
    m_texCombo->blockSignals(true); m_combCombo->blockSignals(true);
    for (const QString &f : scenes)   m_texCombo->addItem(f);
    for (const QString &f : scenes3D) m_texCombo->addItem(f);
    for (const QString &f : combines) m_combCombo->addItem(f);
    m_texCombo->model()->sort(0);
    m_texCombo->blockSignals(false); m_combCombo->blockSignals(false);
    if (m_combCombo->findText("CombinePlain.frag") >= 0)
        m_combCombo->setCurrentText("CombinePlain.frag");
}

// Send whatever the "Add current shader to preset" panel currently says for
// type/geom/stateBytes/shadowExtent to the live preview.  Split out of
// onTextureChanged() so the geom/stateBytes/shadowExtent fields can push an
// update on their own, without re-deriving which file is selected.
void EditorWindow::pushPreviewTexture()
{
    const QString f = m_texCombo->currentText();
    if (f.isEmpty()) return;
    m_preview->setTextureShader(f, m_typeCombo->currentText(),
                                 m_geomCombo->currentText(),
                                 m_stateBytesSpin->value(),
                                 m_shadowExtentSpin->value());
}

void EditorWindow::onTextureChanged()
{
    if (m_texCombo->currentText().isEmpty()) return;
    const QString f = m_texCombo->currentText();
    // Folder tells the type, not the name: KaleidoscopeBase suits the two
    // legacy fullscreen shaders specifically; anything found under Scene3D/
    // is scene3d; everything else defaults to normal.
    if (isScene3D(f))
        m_typeCombo->setCurrentText("scene3d");
    else
        m_typeCombo->setCurrentText(
            (f == "Kaleidoscope.frag" || f == "Tunnel.frag") ? "KaleidoscopeBase" : "normal");
    pushPreviewTexture();
    rebuildParamSliders();
}
void EditorWindow::onCombineChanged()
{
    if (!m_combCombo->currentText().isEmpty())
        m_preview->setCombineShader(m_combCombo->currentText());
    rebuildParamSliders();
}

// Parse a shader's per-activation parameter ranges out of Komplett.xml (the
// preset that registers EVERY shader with sensible min/max values).
struct KomplettParam { QString kind, name; float minV, maxV; };
static QVector<KomplettParam> komplettParamsFor(const QString &root, const QString &frag)
{
    QVector<KomplettParam> out;
    QFile f(root + "/Configurations/Komplett.xml");
    if (!f.open(QIODevice::ReadOnly)) return out;
    const QString xml = QString::fromUtf8(f.readAll());
    QRegularExpression entryRe(
        QString("<(?:Texture|Combine)Shader\\b[^>]*file=\"\\.\\.\\\\\\\\(?:\\w+\\\\\\\\)?%1\"[^>]*>(.*?)</(?:Texture|Combine)Shader>")
            .arg(QRegularExpression::escape(frag)),
        QRegularExpression::DotMatchesEverythingOption);
    const QRegularExpressionMatch em = entryRe.match(xml);
    if (!em.hasMatch()) return out;
    QRegularExpression paramRe(
        "<(int|float)\\s+name=\"(\\w+)\"\\s+minValue=\"([\\d\\.\\-]+)\"\\s+maxValue=\"([\\d\\.\\-]+)\"");
    QRegularExpressionMatchIterator it = paramRe.globalMatch(em.captured(1));
    while (it.hasNext())
    {
        const QRegularExpressionMatch m = it.next();
        out.push_back({ m.captured(1), m.captured(2),
                        m.captured(3).toFloat(), m.captured(4).toFloat() });
    }
    return out;
}

void EditorWindow::rebuildParamSliders()
{
    if (!m_paramForm) return;
    // Clear the old rows + slider registry.
    while (m_paramForm->rowCount() > 0)
        m_paramForm->removeRow(0);
    m_sliders.clear();
    m_preview->setParamOverrides({});

    // If the previewed shader IS the table-selected entry, scrub within that
    // entry's own saved range instead of Komplett.xml's default -- so tuning
    // a range in the panel below is immediately visible here, not just after
    // a save+reload.
    const int selRow = m_table->currentRow();
    const PresetEntry *sel = (selRow >= 0 && selRow < m_preset.entries.size())
                              ? &m_preset.entries[selRow] : nullptr;

    auto addFor = [this, sel](const QString &frag, const QString &prefix, bool fromComb)
    {
        const PresetEntry *e = (sel && sel->isCombine == fromComb && sel->file == frag) ? sel : nullptr;
        for (const KomplettParam &kp : komplettParamsFor(m_root, frag))
        {
            SliderInfo si;
            si.name = kp.name; si.minV = kp.minV; si.maxV = kp.maxV;
            si.isInt = (kp.kind == "int");
            si.fromCombine = fromComb;
            if (e) for (const ShaderParam &p : e->params)
                if (p.name == kp.name && p.kind == kp.kind)
                { si.minV = p.minValue.toFloat(); si.maxV = p.maxValue.toFloat(); break; }
            QSlider *s = new QSlider(Qt::Horizontal);
            s->setRange(0, 1000);
            s->setValue(500);
            si.slider = s;
            m_sliders.push_back(si);
            m_paramForm->addRow(prefix + kp.name, s);
            connect(s, &QSlider::valueChanged, this, [this]{ pushParamOverrides(); });
        }
    };
    addFor(m_texCombo->currentText(),  "",    false);
    addFor(m_combCombo->currentText(), "C: ", true);
    m_paramBox->setVisible(!m_sliders.isEmpty());
    pushParamOverrides();
}

void EditorWindow::pushParamOverrides()
{
    QVector<PreviewWidget::ParamOverride> ov;
    for (const SliderInfo &si : m_sliders)
    {
        float t = si.slider->value() / 1000.f;
        ov.push_back({ si.name, si.minV + t * (si.maxV - si.minV), si.isInt });
    }
    m_preview->setParamOverrides(std::move(ov));
}

// Dice: throw every slider to a random position (live preview follows).
void EditorWindow::randomizeParams()
{
    for (const SliderInfo &si : m_sliders)
        si.slider->setValue(QRandomGenerator::global()->bounded(1001));
}

// Freeze: write the current slider values into the table-selected preset entry
// as min=max parameters (the engine rolls min when min==max -> a fixed look).
void EditorWindow::freezeParamsIntoEntry()
{
    const int row = m_table->currentRow();
    if (row < 0 || row >= m_preset.entries.size())
    {
        m_status->setText("Festwerte: bitte zuerst einen Eintrag in der Tabelle wählen");
        return;
    }
    PresetEntry &e = m_preset.entries[row];
    const QString texFile  = m_texCombo->currentText();
    const QString combFile = m_combCombo->currentText();
    const bool matchesTex  = (!e.isCombine && e.file == texFile);
    const bool matchesComb = ( e.isCombine && e.file == combFile);
    if (!matchesTex && !matchesComb)
    {
        m_status->setText("Festwerte: der gewählte Eintrag ("
                          + e.file + ") passt nicht zum Preview-Shader");
        return;
    }

    int written = 0;
    for (const SliderInfo &si : m_sliders)
    {
        if (si.fromCombine != e.isCombine) continue;
        float t = si.slider->value() / 1000.f;
        float v = si.minV + t * (si.maxV - si.minV);
        QString vs = si.isInt ? QString::number(int(v + 0.5f))
                              : QString::number(v, 'f', 3);
        ShaderParam sp;
        sp.kind = si.isInt ? "int" : "float";
        sp.name = si.name;
        sp.minValue = vs;
        sp.maxValue = vs;
        // Replace an existing param of the same name, else append.
        bool replaced = false;
        for (ShaderParam &old : e.params)
            if (old.name == si.name) { old = sp; replaced = true; break; }
        if (!replaced) e.params.push_back(sp);
        ++written;
    }
    refreshTable();
    m_table->selectRow(row);
    m_status->setText(QString("Festwerte: %1 Parameter in '%2' geschrieben "
                              "(min = max; Save nicht vergessen)")
                      .arg(written).arg(e.file));
}

QVector<ShaderParam> EditorWindow::defaultParamsFor(const QString &f) const
{
    for (const PresetEntry &e : m_komplett.entries)
        if (e.file == f) return e.params;
    return {};
}

void EditorWindow::addTextureEntry()
{
    if (m_texCombo->currentText().isEmpty()) return;
    PresetEntry e;
    e.isCombine = false;
    e.file = m_texCombo->currentText();
    e.type = m_typeCombo->currentText();
    if (e.type == "scene3d")
    {
        e.geom = m_geomCombo->currentText();
        e.stateBytes = m_stateBytesSpin->value();
        e.shadowExtent = m_shadowExtentSpin->value();
    }
    e.minTimeSolo = m_minSolo->value(); e.maxTimeSolo = m_maxSolo->value();
    e.minTimeInterpolation = m_minInterp->value(); e.maxTimeInterpolation = m_maxInterp->value();
    e.probability = m_prob->value(); e.complexity = m_complex->value();
    e.params = defaultParamsFor(e.file);
    m_preset.entries.push_back(e);
    refreshTable();
}
void EditorWindow::addCombineEntry()
{
    if (m_combCombo->currentText().isEmpty()) return;
    PresetEntry e;
    e.isCombine = true;
    e.file = m_combCombo->currentText();
    e.type = "normal";
    e.minTimeSolo = m_minSolo->value(); e.maxTimeSolo = m_maxSolo->value();
    e.minTimeInterpolation = m_minInterp->value(); e.maxTimeInterpolation = m_maxInterp->value();
    e.probability = m_prob->value(); e.complexity = m_complex->value();
    e.params = defaultParamsFor(e.file);
    m_preset.entries.push_back(e);
    refreshTable();
}

void EditorWindow::removeSelectedEntry()
{
    int row = m_table->currentRow();
    if (row < 0 || row >= m_preset.entries.size()) return;
    m_preset.entries.remove(row);
    refreshTable();
}

void EditorWindow::onTableSelectionChanged()
{
    rebuildRangeEditor();
    int row = m_table->currentRow();
    if (row < 0 || row >= m_preset.entries.size()) return;
    const PresetEntry &e = m_preset.entries[row];
    // Preview the selected entry + mirror its settings into the add-controls.
    if (e.isCombine) m_combCombo->setCurrentText(e.file);
    else             m_texCombo->setCurrentText(e.file);
    m_typeCombo->setCurrentText(e.type);
    if (e.type == "scene3d")
    {
        if (!e.geom.isEmpty()) m_geomCombo->setCurrentText(e.geom);
        m_stateBytesSpin->setValue(e.stateBytes);
        m_shadowExtentSpin->setValue(e.shadowExtent);
    }
    m_minSolo->setValue(e.minTimeSolo); m_maxSolo->setValue(e.maxTimeSolo);
    m_minInterp->setValue(e.minTimeInterpolation); m_maxInterp->setValue(e.maxTimeInterpolation);
    m_prob->setValue(e.probability); m_complex->setValue(e.complexity);
    // m_texCombo->setCurrentText() above already re-fired onTextureChanged()
    // (or is a no-op if the text was already current); either way the geom/
    // stateBytes/shadowExtent values just restored need their own push, since
    // onTextureChanged() ran BEFORE this function set them.
    if (!e.isCombine) pushPreviewTexture();
}

// Rebuild the "Selected entry: parameter ranges" panel for whatever row is
// currently selected in the table.  Rows come from the UNION of the entry's
// own params (edit their existing value) and Komplett.xml's declared params
// for that shader that the entry doesn't have yet (editing one of THOSE adds
// it to the entry -- the same action fixes an accidentally-missing param).
void EditorWindow::rebuildRangeEditor()
{
    if (!m_rangeForm) return;
    while (m_rangeForm->rowCount() > 0) m_rangeForm->removeRow(0);
    m_exprRows.clear();   // widgets just destroyed by removeRow(); drop the now-dangling pointers

    const int row = m_table->currentRow();
    if (row < 0 || row >= m_preset.entries.size()) { m_rangeBox->setVisible(false); return; }
    const PresetEntry &entry = m_preset.entries[row];

    struct Row { ShaderParam param; bool present; };
    QVector<Row> combined;
    for (const ShaderParam &p : entry.params) combined.push_back({ p, true });
    for (const ShaderParam &kp : defaultParamsFor(entry.file))
    {
        // Match on (name, kind): a shader can carry an <expr> AND a <float>
        // of the same name (formula + declared clamp range), so a same-named
        // param of a DIFFERENT kind must not hide this one from the panel.
        bool have = false;
        for (const Row &r : combined)
            if (r.param.name == kp.name && r.param.kind == kp.kind) { have = true; break; }
        if (!have) combined.push_back({ kp, false });
    }
    // Interpolator params (rare -- one use in the whole catalogue) have no
    // dedicated control here; they round-trip untouched via e.params.
    combined.erase(std::remove_if(combined.begin(), combined.end(),
                   [](const Row &r){ return r.param.kind == "interpolator"; }), combined.end());
    m_rangeBox->setVisible(!combined.isEmpty());

    // Writes (or creates) the named param in m_preset.entries[row], then
    // refreshes the preview sliders so the new band is immediately visible.
    auto writeParam = [this, row](const QString &name, const QString &kind,
                                   const QString &minV, const QString &maxV,
                                   const QString &prob, const QString &formula)
    {
        if (row < 0 || row >= m_preset.entries.size()) return;
        PresetEntry &ent = m_preset.entries[row];
        ShaderParam *t = nullptr;
        for (ShaderParam &p : ent.params) if (p.name == name) { t = &p; break; }
        if (!t) { ShaderParam np; np.kind = kind; np.name = name; ent.params.push_back(np); t = &ent.params.back(); }
        if (kind == "bool") t->probability = prob;
        else if (kind == "int" || kind == "float") { t->minValue = minV; t->maxValue = maxV; }
        else if (kind == "expr") t->formula = formula;
        rebuildParamSliders();
    };

    for (const Row &r : combined)
    {
        const ShaderParam &p = r.param;
        QLabel *label = new QLabel(p.name + "  [" + p.kind + "]");
        if (!r.present)
            label->setToolTip("Fehlt in diesem Preset-Eintrag (Komplett.xml-Default gezeigt); "
                              "Aendern fuegt den Parameter hinzu.");
        if (p.kind == "bool")
        {
            QDoubleSpinBox *prob = new QDoubleSpinBox();
            prob->setRange(0.0, 1.0); prob->setSingleStep(0.05); prob->setDecimals(2);
            prob->setValue(p.probability.isEmpty() ? 0.5 : p.probability.toDouble());
            connect(prob, QOverload<double>::of(&QDoubleSpinBox::valueChanged), this,
                    [=](double v){ writeParam(p.name, "bool", {}, {}, QString::number(v, 'f', 2), {}); });
            m_rangeForm->addRow(label, prob);
        }
        else if (p.kind == "int" || p.kind == "float")
        {
            const bool isInt = (p.kind == "int");
            QDoubleSpinBox *lo = new QDoubleSpinBox(), *hi = new QDoubleSpinBox();
            for (QDoubleSpinBox *s : { lo, hi })
            {
                s->setRange(-1.0e6, 1.0e6);
                s->setDecimals(isInt ? 0 : 4);
                s->setSingleStep(isInt ? 1.0 : 0.01);
            }
            lo->setValue(p.minValue.toDouble()); hi->setValue(p.maxValue.toDouble());
            auto fmt = [isInt](double v){ return isInt ? QString::number(int(v))
                                                        : QString::number(v, 'f', 4); };
            auto apply = [=]{ writeParam(p.name, p.kind, fmt(lo->value()), fmt(hi->value()), {}, {}); };
            connect(lo, QOverload<double>::of(&QDoubleSpinBox::valueChanged), this, apply);
            connect(hi, QOverload<double>::of(&QDoubleSpinBox::valueChanged), this, apply);
            QWidget *host = new QWidget();
            QHBoxLayout *hl = new QHBoxLayout(host);
            hl->setContentsMargins(0, 0, 0, 0);
            hl->addWidget(new QLabel("min")); hl->addWidget(lo);
            hl->addWidget(new QLabel("max")); hl->addWidget(hi);
            m_rangeForm->addRow(label, host);
        }
        else if (p.kind == "expr")
        {
            QLineEdit *edit = new QLineEdit(p.formula);
            connect(edit, &QLineEdit::editingFinished, this,
                    [=]{ writeParam(p.name, "expr", {}, {}, {}, edit->text()); });
            // Variable picker: ExprEval.h documents ~38 audio-derived names
            // (bassRel, chromaHue, beatPhase, seed1, ...) but nothing in the
            // editor ever listed them -- authoring a formula meant already
            // knowing the exact spelling. Selecting one INSERTS it at the
            // cursor (formulas are combinations like "chromaHue + seed1*1.5",
            // not single tokens), then resets to the placeholder so it can be
            // used again for the next variable in the same formula.
            QComboBox *varPick = new QComboBox();
            varPick->addItem(tr("Variable einfügen…"));
            const char *const *names = ExprVars::names();
            for (int i = 0; i < ExprVars::V_COUNT; ++i)
                varPick->addItem(names[i]);
            connect(varPick, QOverload<int>::of(&QComboBox::currentIndexChanged), this,
                    [=](int idx) {
                        if (idx <= 0) return;
                        edit->insert(varPick->itemText(idx));
                        edit->setFocus();
                        varPick->setCurrentIndex(0);
                        writeParam(p.name, "expr", {}, {}, {}, edit->text());
                    });
            // Live readout: shows what the formula currently evaluates to
            // (against the synthesized audio state -- see
            // PreviewWidget::evalExpr()) and turns red instead of quietly
            // evaluating to 0 on a typo. Recompiled on every keystroke, kept
            // separate from the writeParam() commit on editingFinished so a
            // half-typed formula isn't written into the preset yet.
            QLabel *valueLbl = new QLabel();
            valueLbl->setMinimumWidth(64);
            valueLbl->setAlignment(Qt::AlignRight | Qt::AlignVCenter);
            const int rowIdx = m_exprRows.size();
            m_exprRows.push_back({ edit, valueLbl, nullptr });
            auto recompile = [this, rowIdx]() {
                if (rowIdx >= m_exprRows.size()) return;   // stale (panel rebuilt meanwhile)
                ExprRow &er = m_exprRows[rowIdx];
                auto prog = std::make_shared<ExprProgram>();
                const bool ok = prog->compile(er.edit->text().toStdString(), "editor");
                er.edit->setStyleSheet(ok ? QString() : "background: #663333;");
                er.edit->setToolTip(ok ? QString() : tr("Syntaxfehler (Details in der Konsole)"));
                er.prog = ok ? prog : nullptr;
                er.valueLbl->setText(ok ? QString::number(m_preview->evalExpr(*prog), 'f', 3)
                                        : tr("Fehler"));
            };
            connect(edit, &QLineEdit::textChanged, this, [=](const QString &){ recompile(); });
            recompile();
            QWidget *host = new QWidget();
            QHBoxLayout *hl = new QHBoxLayout(host);
            hl->setContentsMargins(0, 0, 0, 0);
            hl->addWidget(edit, 1);
            hl->addWidget(varPick);
            hl->addWidget(valueLbl);
            m_rangeForm->addRow(label, host);
        }
    }
}

// Re-evaluate every currently-valid <expr> row against the animated
// synthetic audio state (the formula text itself only changes on keystrokes;
// its VALUE changes every frame, driven by the preview's Beat/Drone clock).
void EditorWindow::tickExprValues()
{
    for (const ExprRow &er : m_exprRows)
        if (er.prog)
            er.valueLbl->setText(QString::number(m_preview->evalExpr(*er.prog), 'f', 3));
}

void EditorWindow::refreshTable()
{
    m_table->setRowCount(m_preset.entries.size());
    for (int i = 0; i < m_preset.entries.size(); ++i)
    {
        const PresetEntry &e = m_preset.entries[i];
        auto set = [&](int col, const QString &s){ m_table->setItem(i, col, new QTableWidgetItem(s)); };
        set(0, e.isCombine ? "Combine" : "Texture");
        set(1, e.file);
        set(2, e.type);
        set(3, e.geom);
        set(4, QString::number(e.minTimeSolo));
        set(5, QString::number(e.maxTimeSolo));
        set(6, QString::number(e.minTimeInterpolation));
        set(7, QString::number(e.maxTimeInterpolation));
        set(8, QString::number(e.probability));
        set(9, QString::number(e.complexity));
    }
    rebuildRangeEditor();
}

void EditorWindow::metaToUi()
{
    m_nameEdit->setText(m_preset.name);
    m_imgDirEdit->setText(m_preset.imageDirectory);
    m_gSoloMin->setValue(m_preset.timeTextureSoloMin);
    m_gSoloMax->setValue(m_preset.timeTextureSoloMax);
    m_gInterpMin->setValue(m_preset.timeTextureInterpolationMin);
    m_gInterpMax->setValue(m_preset.timeTextureInterpolationMax);
    m_preview->setImageDirectory(m_preset.imageDirectory);
    refreshTable();
}
void EditorWindow::uiToMeta()
{
    m_preset.name = m_nameEdit->text().trimmed();
    m_preset.imageDirectory = m_imgDirEdit->text();
    m_preset.timeTextureSoloMin = m_gSoloMin->value();
    m_preset.timeTextureSoloMax = m_gSoloMax->value();
    m_preset.timeTextureInterpolationMin = m_gInterpMin->value();
    m_preset.timeTextureInterpolationMax = m_gInterpMax->value();
}

void EditorWindow::newPreset()
{
    Preset keepDir; keepDir.imageDirectory = m_imgDirEdit->text();
    m_preset = keepDir;
    metaToUi();
    m_status->setText("new preset");
}

void EditorWindow::openPreset()
{
    const QString dir = m_root + "/Configurations";
    QString path = QFileDialog::getOpenFileName(this, "Open preset", dir, "Presets (*.xml)");
    if (path.isEmpty()) return;
    Preset p; QString err;
    if (!Preset::load(path, p, &err))
    {
        QMessageBox::warning(this, "Open failed", err);
        return;
    }
    m_preset = p;
    metaToUi();
    m_status->setText("loaded " + QFileInfo(path).fileName());
}

void EditorWindow::savePreset()
{
    uiToMeta();
    if (m_preset.name.isEmpty())
    {
        QMessageBox::warning(this, "Save", "Please enter a preset name.");
        return;
    }
    const QString dir = m_root + "/Configurations";
    QDir().mkpath(dir);
    const QString path = dir + "/" + m_preset.name + ".xml";
    if (QFileInfo::exists(path) &&
        QMessageBox::question(this, "Overwrite?", path + "\nalready exists. Overwrite?")
            != QMessageBox::Yes)
        return;
    QString err;
    if (!m_preset.save(path, &err))
        QMessageBox::warning(this, "Save failed", err);
    else
        m_status->setText("saved " + path);
}

void EditorWindow::browseImageDir()
{
    QString d = QFileDialog::getExistingDirectory(this, "Image directory", m_imgDirEdit->text());
    if (!d.isEmpty())
    {
        m_imgDirEdit->setText(d);
        m_preview->setImageDirectory(d);
    }
}

void EditorWindow::stepCombo(QComboBox *c, int delta)
{
    int n = c->count(); if (n == 0) return;
    c->setCurrentIndex((c->currentIndex() + delta + n) % n);
}

void EditorWindow::keyPressEvent(QKeyEvent *e)
{
    switch (e->key())
    {
    case Qt::Key_BracketRight: stepCombo(m_texCombo, +1); return;
    case Qt::Key_BracketLeft:  stepCombo(m_texCombo, -1); return;
    case Qt::Key_Period:       stepCombo(m_combCombo, +1); return;
    case Qt::Key_Comma:        stepCombo(m_combCombo, -1); return;
    case Qt::Key_A:            addTextureEntry(); return;
    case Qt::Key_C:            addCombineEntry(); return;
    case Qt::Key_M:            m_musicCombo->setCurrentIndex(1 - m_musicCombo->currentIndex()); return;
    case Qt::Key_W:            loadAudioWav(); return;
    case Qt::Key_Delete:       removeSelectedEntry(); return;
    default: QMainWindow::keyPressEvent(e);
    }
}

// REAL audio preview: pick a WAV, run it through the actual AudioAnalyzer
// (full pipeline, offline, a few seconds), then loop sound + feature timeline
// in the preview.  Picking Cancel while a timeline is active switches back to
// the synthetic profile and stops the sound.
void EditorWindow::loadAudioWav()
{
    const QString path = QFileDialog::getOpenFileName(
        this, "Audio-WAV für die Vorschau (PCM16)", QString(), "WAV (*.wav)");
    if (path.isEmpty())
    {
        if (m_preview->hasAudioTimeline())
        {
            PlaySoundW(NULL, NULL, 0);                      // stop looped sound
            m_preview->setAudioTimeline({});
            m_status->setText("Audio preview: back to synthetic profile");
        }
        return;
    }

    QApplication::setOverrideCursor(Qt::WaitCursor);
    std::vector<AudioFeatures> tl = AudioAnalyzer::analyzeWavToTimeline(path);
    QApplication::restoreOverrideCursor();
    if (tl.empty())
    {
        m_status->setText("Audio preview: could not analyse " + path);
        return;
    }

    m_wavPath = path;
    m_preview->setAudioTimeline(std::move(tl));
    // Loop the sound; the preview loops its timeline with the same period.
    PlaySoundW(reinterpret_cast<LPCWSTR>(m_wavPath.utf16()), NULL,
               SND_FILENAME | SND_ASYNC | SND_LOOP);
    m_status->setText(QString("Audio preview: %1 (%2 s, echte Analyzer-Features)")
                      .arg(QFileInfo(path).fileName())
                      .arg(m_preview->hasAudioTimeline() ? "loop" : "?"));
}
