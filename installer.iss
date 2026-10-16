; installer.iss - Inno Setup script for the Kaleidoscope Enhanced visualizer.
; ---------------------------------------------------------------------------
; Builds a classic Windows setup.exe from the standalone package produced by
; deploy.ps1 (dist\KaleidoscopeVisualizer\).  The package is fully self-
; contained (Qt + MSVC runtime bundled), so the target PC needs neither Qt nor
; Visual Studio.
;
; Usage:
;   1. Run   powershell -ExecutionPolicy Bypass -File .\deploy.ps1 -Build
;      to stage dist\KaleidoscopeVisualizer\ .
;   2. Install Inno Setup (https://jrsoftware.org/isdl.php), then run:
;        ISCC.exe installer.iss
;      (deploy.ps1 does step 2 automatically if ISCC.exe is on PATH).
;
; The app loads its shaders/configs from "..\" relative to the exe, so the
; exe lives in {app}\bin and the assets in {app}; the shortcut's working
; directory is therefore {app}\bin.  The staged package also contains the
; PresetEditor (bin\PresetEditor.exe + the PresetEditor\ CWD-anchor folder),
; the SetupTool (bin\KaleidoscopeSetup.exe) and the video export tool
; (bin\KaleidoscopeExport.exe); the recursive [Files] entry picks all of that
; up, and [Icons] adds a start-menu shortcut for each.
; ---------------------------------------------------------------------------

#define MyAppName "Kaleidoscope Enhanced"
#define MyAppExeName "Kaleidoscope.exe"
#define MyAppPublisher "Rene Weller"
#define MyAppVersion "1.17.0"
; Staged package produced by deploy.ps1:
#define SrcDir "dist\KaleidoscopeVisualizer"

[Setup]
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
; Per user, without admin rights: {autopf} is then %LOCALAPPDATA%\Programs. The
; program keeps its settings, taste, scene memory, cache, recordings and replays
; beside itself ({app}), and under C:\Program Files a normal user cannot write
; there -- every one of those writes failed without a word (16.10.2026). An old
; installation for all users is found in [Code] below and can be removed first;
; the automatic update starts this setup too, so it would otherwise end up with
; two installations.
PrivilegesRequired=lowest
DefaultDirName={autopf}\KaleidoscopeVisualizer
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=dist
OutputBaseFilename=KaleidoscopeVisualizer-Setup
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\bin\{#MyAppExeName}
SetupIconFile=icon.ico
WizardStyle=modern

[Languages]
Name: "german";  MessagesFile: "compiler:Languages\German.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

; Release tags the extra content hangs off. A GitHub asset's download URL is
; deterministic (…/releases/download/<tag>/<file>), so no API call is needed --
; but it also means a pack re-published under a NEW tag has to be updated here.
#define ImagesTag "images-v2"
#define ModelsTag "models-v3"
#define RelUrl "https://github.com/reneweller-coding/KaleidoscopeEnhanced/releases/download"

[CustomMessages]
german.PacksGroup=Zusatzinhalte (werden aus dem Internet geladen)
german.PackImages=Bilder: 977 lizenzfreie Texturen (593 MB)
german.PackShips=3D-Modelle: Raumschiffe, 79 Stück (715 MB)
german.PackStations=3D-Modelle: Stationen, 30 Stück (259 MB)
german.PackObjects=3D-Modelle: Objekte, 48 Stück (384 MB)
german.PackFailed=Der Download der Zusatzinhalte ist fehlgeschlagen:%n%n%1%n%nDie Installation wird ohne sie fortgesetzt. Sie lassen sich jederzeit im Kaleidoscope-Setup nachladen.
english.PacksGroup=Extra content (downloaded from the internet)
english.PackImages=Photos: 977 licence-free textures (593 MB)
english.PackShips=3D models: ships, 79 of them (715 MB)
english.PackStations=3D models: stations, 30 of them (259 MB)
english.PackObjects=3D models: objects, 48 of them (384 MB)
english.PackFailed=Downloading the extra content failed:%n%n%1%n%nInstallation continues without it. You can fetch it any time from Kaleidoscope Setup.
german.OldInstall=Eine ältere Installation für alle Benutzer liegt in%n%n%1%n%nDort kann das Programm seine Einstellungen nicht speichern; die neue Version installiert sich deshalb in Ihr Benutzerprofil.%n%nDie alte Installation jetzt entfernen?%n%nJa: entfernen (fragt nach Administratorrechten). Nein: beide behalten. Abbrechen: Setup beenden.
german.OldUninstFailed=Die alte Installation wurde nicht entfernt. Sie lässt sich später unter Einstellungen > Apps deinstallieren.
english.OldInstall=An older installation for all users is in%n%n%1%n%nThe program cannot save its settings there, so the new version installs into your user profile.%n%nRemove the old installation now?%n%nYes: remove it (asks for administrator rights). No: keep both. Cancel: quit setup.
german.Autostart=Beim Anmelden im Vollbild starten (mit Watchdog: startet nach Absturz oder Hänger neu)
english.Autostart=Start fullscreen at sign-in (with the watchdog: restarts after a crash or a hang)
english.OldUninstFailed=The old installation was not removed. You can uninstall it later under Settings > Apps.

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "autostart";   Description: "{cm:Autostart}";        GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
; FLAT names on purpose. Inno reads a backslash in a task name as hierarchy, and
; "packs\images" with no "packs" task above it does not fail to compile -- it
; silently becomes a CHILD of whatever task precedes it, here the desktop icon,
; which is unchecked by default. The packs would then have been unreachable.
; Ticked by default: without pictures the whole photo-scene category falls back
; to a procedural texture, and without models 238 scenes are skipped -- so the
; default install is the COMPLETE program. Anyone on a metered line unticks
; them, and the wizard shows what each one costs before they do.
Name: "packimages";   Description: "{cm:PackImages}";   GroupDescription: "{cm:PacksGroup}"
Name: "packships";    Description: "{cm:PackShips}";    GroupDescription: "{cm:PacksGroup}"
Name: "packstations"; Description: "{cm:PackStations}"; GroupDescription: "{cm:PacksGroup}"
Name: "packobjects";  Description: "{cm:PackObjects}";  GroupDescription: "{cm:PacksGroup}"

[Files]
; The entire staged standalone package (exe + Qt/MSVC runtime + shaders + configs).
; Excludes: running the packaged exe once out of dist\ -- which is exactly how
; one smoke-tests a release -- makes it write its own settings file and fill
; cache\ with downloaded artist images and lyrics from whatever was playing.
; Those are the packager's data, not the product's, and "{#SrcDir}\*" would
; ship them to every user.  deploy.ps1 wipes the staging folder before each
; run, so this only matters when a test happens between staging and compiling.
Source: "{#SrcDir}\*"; DestDir: "{app}"; Excludes: "cache\*,kaleidoscope_settings.ini,*.log"; Flags: recursesubdirs createallsubdirs ignoreversion
; The packs, fetched into {tmp} by the [Code] download page below and unpacked
; straight into the folders the program already looks in. "external" because
; they are not compiled into this installer; "extractarchive" does the unzip.
Source: "{tmp}\KaleidoscopeImages.zip";          DestDir: "{app}\Images"; Flags: external extractarchive ignoreversion; Tasks: packimages
Source: "{tmp}\KaleidoscopeModels-ships.zip";    DestDir: "{app}\Models"; Flags: external extractarchive ignoreversion; Tasks: packships
Source: "{tmp}\KaleidoscopeModels-stations.zip"; DestDir: "{app}\Models"; Flags: external extractarchive ignoreversion; Tasks: packstations
Source: "{tmp}\KaleidoscopeModels-objects.zip";  DestDir: "{app}\Models"; Flags: external extractarchive ignoreversion; Tasks: packobjects

[Icons]
; Working directory = {app}\bin so the app's "..\" asset paths resolve.
Name: "{group}\{#MyAppName}";            Filename: "{app}\bin\{#MyAppExeName}"; WorkingDir: "{app}\bin"
; Fullscreen through the watchdog (watchdog.ps1 starts bin\Kaleidoscope.exe -b -l and restarts it after a crash
; or a hang); PowerShell hidden, so no console window stands behind the show.
Name: "{group}\{#MyAppName} (Vollbild)"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""{app}\watchdog.ps1"""; WorkingDir: "{app}"; IconFilename: "{app}\bin\{#MyAppExeName}"
Name: "{userstartup}\{#MyAppName} (Vollbild)"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""{app}\watchdog.ps1"""; WorkingDir: "{app}"; IconFilename: "{app}\bin\{#MyAppExeName}"; Tasks: autostart
; Preset editor (bundled since the deploy.ps1 3b step): its own console window
; shows shader-compile/formula logs on purpose. The exe re-anchors its CWD to
; {app}\PresetEditor itself, so bin\ as WorkingDir is only the starting point.
Name: "{group}\{#MyAppName} Preset-Editor"; Filename: "{app}\bin\PresetEditor.exe"; WorkingDir: "{app}\bin"
; Settings tool (bundled since the deploy.ps1 3c step): edits kaleidoscope_settings.ini
; offline (lyrics/artist images/video/language/...); needs no CWD anchor of its own.
Name: "{group}\{#MyAppName} Setup"; Filename: "{app}\bin\KaleidoscopeSetup.exe"; WorkingDir: "{app}\bin"
; Video export (bundled since the deploy.ps1 3d step): an audio file in, an mp4 of the show out.
Name: "{group}\{#MyAppName} Video-Export"; Filename: "{app}\bin\KaleidoscopeExport.exe"; WorkingDir: "{app}\bin"
Name: "{autodesktop}\{#MyAppName}";      Filename: "{app}\bin\{#MyAppExeName}"; WorkingDir: "{app}\bin"; Tasks: desktopicon

[Run]
Filename: "{app}\bin\{#MyAppExeName}"; WorkingDir: "{app}\bin"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent

[Code]
{ ---------------------------------------------------------------------------
  Extra content: the photo library and the 3D models are published as GitHub
  release assets rather than compiled into this installer -- together they are
  about 2 GB against a 20 MB setup.exe, and most of that is of no use to
  someone who only wants the classic visualizer.

  Downloaded on the Ready page (before anything is written), so a failure
  costs nothing but the download: the wizard reports it and installs the
  program anyway, with the packs still reachable later from Kaleidoscope
  Setup. The [Files] entries above then unzip whatever arrived.
  --------------------------------------------------------------------------- }
var
  DownloadPage: TDownloadWizardPage;
  OldAdminDir: String; { an old installation for all users (Program Files), or '' }

{ ---------------------------------------------------------------------------
  Up to 1.17 the setup installed for all users, into Program Files, where the
  program cannot write its settings. This one installs per user. An old
  all-users installation is offered for removal before anything happens --
  the automatic update starts this setup as well, and would leave two
  installations side by side -- and its settings file, if it ever got one
  (run as administrator), comes along into the new folder.
  --------------------------------------------------------------------------- }
const
  UninstKey = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{#MyAppName}_is1';

function OldAdminInstall(var Dir, Uninst: String): Boolean;
begin
  Result := RegQueryStringValue( HKLM64, UninstKey, 'UninstallString', Uninst )
            or RegQueryStringValue( HKLM32, UninstKey, 'UninstallString', Uninst );
  if Result then
    if not RegQueryStringValue( HKLM64, UninstKey, 'InstallLocation', Dir ) then
      RegQueryStringValue( HKLM32, UninstKey, 'InstallLocation', Dir );
end;

function InitializeSetup: Boolean;
var
  Uninst: String;
  Code: Integer;
begin
  Result := True;
  OldAdminDir := '';
  if not OldAdminInstall( OldAdminDir, Uninst ) then
    Exit;
  case SuppressibleMsgBox( FmtMessage( CustomMessage( 'OldInstall' ), [RemoveBackslash( OldAdminDir )] ),
                           mbConfirmation, MB_YESNOCANCEL, IDNO ) of
    IDYES:
      { The old uninstaller asks for administrator rights itself; ShellExec lets it (Exec could not elevate). }
      if not ShellExec( 'open', RemoveQuotes( Uninst ), '/SILENT', '', SW_SHOW, ewWaitUntilTerminated, Code )
         or ( Code <> 0 ) then
        SuppressibleMsgBox( CustomMessage( 'OldUninstFailed' ), mbError, MB_OK, IDOK );
    IDCANCEL:
      Result := False;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  OldIni, NewIni: String;
begin
  if ( CurStep <> ssPostInstall ) or ( OldAdminDir = '' ) then
    Exit;
  { An uninstaller leaves files it did not install, so the old settings are still there to take along. }
  OldIni := AddBackslash( OldAdminDir ) + 'kaleidoscope_settings.ini';
  NewIni := ExpandConstant( '{app}\kaleidoscope_settings.ini' );
  if FileExists( OldIni ) and not FileExists( NewIni ) then
    FileCopy( OldIni, NewIni, True );
end;

function OnDownloadProgress(const Url, FileName: String; const Progress, ProgressMax: Int64): Boolean;
begin
  Result := True;
end;

procedure InitializeWizard;
begin
  DownloadPage := CreateDownloadPage( SetupMessage( msgWizardPreparing ),
                                      SetupMessage( msgPreparingDesc ),
                                      @OnDownloadProgress );
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID <> wpReady then
    Exit;

  DownloadPage.Clear;
  if WizardIsTaskSelected( 'packimages' ) then
    DownloadPage.Add( '{#RelUrl}/{#ImagesTag}/KaleidoscopeImages.zip', 'KaleidoscopeImages.zip', '' );
  if WizardIsTaskSelected( 'packships' ) then
    DownloadPage.Add( '{#RelUrl}/{#ModelsTag}/KaleidoscopeModels-ships.zip', 'KaleidoscopeModels-ships.zip', '' );
  if WizardIsTaskSelected( 'packstations' ) then
    DownloadPage.Add( '{#RelUrl}/{#ModelsTag}/KaleidoscopeModels-stations.zip', 'KaleidoscopeModels-stations.zip', '' );
  if WizardIsTaskSelected( 'packobjects' ) then
    DownloadPage.Add( '{#RelUrl}/{#ModelsTag}/KaleidoscopeModels-objects.zip', 'KaleidoscopeModels-objects.zip', '' );

  DownloadPage.Show;
  try
    try
      DownloadPage.Download;
    except
      { Do NOT abort the install. The program is complete and useful without
        the packs -- it skips the model scenes and falls back to a procedural
        texture for the photo ones -- so a flaky connection must not cost the
        user the whole installation. Untick the tasks so the [Files] entries
        above do not then look for archives that were never downloaded. }
      SuppressibleMsgBox( FmtMessage( CustomMessage( 'PackFailed' ), [GetExceptionMessage] ),
                          mbError, MB_OK, IDOK );
      WizardSelectTasks( '!packimages,!packships,!packstations,!packobjects' );
    end;
  finally
    DownloadPage.Hide;
  end;
end;
