#include "EditorWindow.h"
#include "PreviewWidget.h"

#include <QtWidgets/QComboBox>
#include <QtWidgets/QSpinBox>
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
#include <QtGui/QKeyEvent>

// Real-analyzer WAV preview: the actual analysis pipeline + looped playback.
#include "../AudioAnalyzer.h"
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

    // Add-to-preset
    QGroupBox *gAdd = new QGroupBox("Add current shader to preset");
    QFormLayout *fAdd = new QFormLayout(gAdd);
    m_typeCombo = new QComboBox();
    m_typeCombo->addItems({ "normal", "KaleidoscopeBase" });
    m_minSolo = mkSpin(0, 100000, 20);   m_maxSolo = mkSpin(0, 100000, 80);
    m_minInterp = mkSpin(0, 100000, 15); m_maxInterp = mkSpin(0, 100000, 50);
    m_prob = new QDoubleSpinBox(); m_prob->setRange(0.0, 1.0); m_prob->setSingleStep(0.05); m_prob->setValue(0.5);
    m_complex = mkSpin(1, 20, 1);
    fAdd->addRow("Type (texture)", m_typeCombo);
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
    m_table = new QTableWidget(0, 9);
    m_table->setHorizontalHeaderLabels(
        { "Kind", "File", "Type", "SoloMin", "SoloMax", "IntMin", "IntMax", "Prob", "Cplx" });
    m_table->horizontalHeader()->setSectionResizeMode(1, QHeaderView::Stretch);
    m_table->setSelectionBehavior(QAbstractItemView::SelectRows);
    m_table->setEditTriggers(QAbstractItemView::NoEditTriggers);
    vTab->addWidget(m_table);
    QPushButton *bRemove = new QPushButton("Remove selected  (Del)");
    vTab->addWidget(bRemove);
    pl->addWidget(gTab, 1);

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

    scanShaders();
    metaToUi();
    onTextureChanged();
    onCombineChanged();
}

void EditorWindow::scanShaders()
{
    QDir d(m_root);
    const QStringList all = d.entryList({ "*.frag" }, QDir::Files, QDir::Name);
    // Internal pipeline shaders that are not user-selectable effects.
    static const QStringList skip = {
        "Present.frag", "Feedback.frag", "ReactionDiffusionSim.frag",
        "BloomBlur.frag", "default.frag", "CombineShader.frag"
    };
    m_texCombo->blockSignals(true); m_combCombo->blockSignals(true);
    for (const QString &f : all)
    {
        if (skip.contains(f)) continue;
        if (f.startsWith("Combine")) m_combCombo->addItem(f);
        else                         m_texCombo->addItem(f);
    }
    m_texCombo->blockSignals(false); m_combCombo->blockSignals(false);
    if (m_combCombo->findText("CombinePlain.frag") >= 0)
        m_combCombo->setCurrentText("CombinePlain.frag");
}

void EditorWindow::onTextureChanged()
{
    if (m_texCombo->currentText().isEmpty()) return;
    m_preview->setTextureShader(m_texCombo->currentText());
    // KaleidoscopeBase suits the Kaleidoscope/Tunnel bases; default others to normal.
    const QString f = m_texCombo->currentText();
    m_typeCombo->setCurrentText(
        (f == "Kaleidoscope.frag" || f == "Tunnel.frag") ? "KaleidoscopeBase" : "normal");
}
void EditorWindow::onCombineChanged()
{
    if (!m_combCombo->currentText().isEmpty())
        m_preview->setCombineShader(m_combCombo->currentText());
}

QVector<ShaderParam> EditorWindow::defaultParamsFor(const QString &f)
{
    auto B = [](const QString &n, const QString &p){ ShaderParam s; s.kind="bool"; s.name=n; s.probability=p; return s; };
    auto I = [](const QString &n, const QString &a, const QString &b){ ShaderParam s; s.kind="int"; s.name=n; s.minValue=a; s.maxValue=b; return s; };
    auto F = [](const QString &n, const QString &a, const QString &b){ ShaderParam s; s.kind="float"; s.name=n; s.minValue=a; s.maxValue=b; return s; };

    QVector<ShaderParam> v;
    if (f == "Kaleidoscope.frag")      { v << B("rotate","0.7") << I("sides","2","14") << F("speed","0.04","0.09"); }
    else if (f == "Tunnel.frag")       { v << B("rotate","0.7") << F("speedTunnel","0.005","0.07") << I("sides","2","14") << F("speed","0.01","0.09"); }
    else if (f == "TunnelPlain.frag")  { v << F("sides","2","14") << F("speed","0.01","0.05") << F("power","1.0","4.0"); }
    else if (f == "CombineMulti.frag") { v << B("rot","0.5") << F("copies","3.0","12.0"); }
    else if (f == "CombineDarkRed.frag"){ v << B("red","0.95") << B("rotate","0.7"); }
    else if (f == "CombineLichtenstein.frag") { v << F("size","4.0","18.0"); }
    return v;
}

void EditorWindow::addTextureEntry()
{
    if (m_texCombo->currentText().isEmpty()) return;
    PresetEntry e;
    e.isCombine = false;
    e.file = m_texCombo->currentText();
    e.type = m_typeCombo->currentText();
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
    int row = m_table->currentRow();
    if (row < 0 || row >= m_preset.entries.size()) return;
    const PresetEntry &e = m_preset.entries[row];
    // Preview the selected entry + mirror its settings into the add-controls.
    if (e.isCombine) m_combCombo->setCurrentText(e.file);
    else             m_texCombo->setCurrentText(e.file);
    m_typeCombo->setCurrentText(e.type);
    m_minSolo->setValue(e.minTimeSolo); m_maxSolo->setValue(e.maxTimeSolo);
    m_minInterp->setValue(e.minTimeInterpolation); m_maxInterp->setValue(e.maxTimeInterpolation);
    m_prob->setValue(e.probability); m_complex->setValue(e.complexity);
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
        set(3, QString::number(e.minTimeSolo));
        set(4, QString::number(e.maxTimeSolo));
        set(5, QString::number(e.minTimeInterpolation));
        set(6, QString::number(e.maxTimeInterpolation));
        set(7, QString::number(e.probability));
        set(8, QString::number(e.complexity));
    }
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
