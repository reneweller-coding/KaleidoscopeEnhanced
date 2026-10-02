# preview with music values: q2.sh Name t "p=v ..." [audioset]
# audioset: 0 = quiet, 1 = mid (default), 2 = loud
sp="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$sp/quick"
# photos: the app's own pool (Images/), or SCENEGEN_POOLS/pool<POOL> for a fixed test set
if [ -n "$SCENEGEN_POOLS" ]; then imgs="$SCENEGEN_POOLS/pool${POOL:-1}"; else imgs="$sp/../../Images"; fi
cd "$sp/../../Release"
f="../Scene2D/$1.frag"; [ -f "$f" ] || f="../Scene3D/$1.frag"
args=""; for kv in $3; do args="$args --param $kv"; done
t=$2; a=${4:-1}
case $a in
0) A="audioSwell=0.15 audioBass=0.1 audioKick=0.0 audioHigh=0.1 audioMid=0.1 audioLevel=0.2 audioMode=0.3 audioRoughness=0.1 audioSpread=0.3 audioRolloff=0.3 audioHarmChange=0.0 audioCentroid=0.3 audioBeat=0.0 audioSubBass=0.1 audioFlux=0.1";;
2) A="audioSwell=0.9 audioBass=0.9 audioKick=0.8 audioHigh=0.8 audioMid=0.7 audioLevel=0.9 audioMode=0.8 audioRoughness=0.7 audioSpread=0.8 audioRolloff=0.8 audioHarmChange=0.6 audioCentroid=0.7 audioBeat=0.8 audioSubBass=0.8 audioFlux=0.7";;
*) A="audioSwell=0.5 audioBass=0.5 audioKick=0.3 audioHigh=0.4 audioMid=0.4 audioLevel=0.5 audioMode=0.6 audioRoughness=0.3 audioSpread=0.5 audioRolloff=0.5 audioHarmChange=0.2 audioCentroid=0.5 audioBeat=0.3 audioSubBass=0.4 audioFlux=0.3";;
esac
ex=""; for kv in $A; do ex="$ex --expr $kv"; done
out="$sp/quick/$1_q${a}.png"
timeout 60 ../PresetEditor/build/Release/PresetEditor.exe --render "$f" ../FX/FxPlain.frag "$out" 960 540 --time $t --expr sceneTime=$t --expr sceneAdvance=$(($t/2)) --expr audioPhase=$(python -c "print($t*0.05)") --expr audioAdvance=$(python -c "print($t*0.03)") $ex --images "$imgs" --param hueP=1.0 $args > "$sp/quick/$1_q.log" 2>&1
grep -iE "error|unknown|not found" "$sp/quick/$1_q.log" | head -5
