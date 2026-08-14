#!/usr/bin/env sh
set -eu

ANDROID_TARGET="${ANDROID_TARGET:-android-35}"
ANDROID_ARCH="${ANDROID_ARCH:-x86_64}"
AVD_NAME="${AVD_NAME:-testhistory_api35}"
REQUIRE_KVM="${REQUIRE_KVM:-true}"
EMULATOR_MEMORY_MB="${EMULATOR_MEMORY_MB:-4096}"
EMULATOR_CORES="${EMULATOR_CORES:-4}"
EMULATOR_PARTITION_MB="${EMULATOR_PARTITION_MB:-8192}"
ANDROID_TEST_TIMEOUT="${ANDROID_TEST_TIMEOUT:-900s}"
GRADLE_TIMEOUT_SECONDS="${GRADLE_TIMEOUT_SECONDS:-900s}"

now_seconds() {
  date +%s
}

adb_shell_value() {
  timeout 10s adb shell "$@" 2>/dev/null | tr -d '\r'
}

run_gradle() {
  echo "Running Gradle: $*"
  if command -v gradle >/dev/null 2>&1; then
    timeout "$GRADLE_TIMEOUT_SECONDS" gradle "$@"
  else
    timeout "$GRADLE_TIMEOUT_SECONDS" sh scripts/ci-gradle.sh "$@"
  fi
  echo "Gradle finished: $*"
}

sdkmanager ${SDKMANAGER_PROXY_ARGS:-} "platform-tools" "platforms;${ANDROID_TARGET}" "system-images;${ANDROID_TARGET};google_apis;${ANDROID_ARCH}"

ANDROID_APP_ID="${ANDROID_APP_ID:-com.testhistory.sample}"
ANDROID_TEST_APP_ID="${ANDROID_TEST_APP_ID:-com.testhistory.sample.test}"
ANDROID_TEST_RUNNER="${ANDROID_TEST_RUNNER:-androidx.test.runner.AndroidJUnitRunner}"
ANDROID_APP_APK="${ANDROID_APP_APK:-app/build/outputs/apk/debug/app-debug.apk}"
ANDROID_TEST_APK="${ANDROID_TEST_APK:-app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk}"
ANDROID_INSTRUMENTATION_LOG="${ANDROID_INSTRUMENTATION_LOG:-android-instrumentation.log}"

# Build before starting the emulator. The emulator needs CPU/RAM headroom during
# boot, and Gradle dependency resolution can otherwise sit silently long enough
# to hit the wrapper timeout.
echo "Building Android debug and androidTest APKs..."
run_gradle --no-daemon --console=plain --info --stacktrace :app:assembleDebug :app:assembleDebugAndroidTest

echo "no" | avdmanager create avd --force --name "${AVD_NAME}" --package "system-images;${ANDROID_TARGET};google_apis;${ANDROID_ARCH}" --device pixel_6
AVD_CONFIG="${HOME}/.android/avd/${AVD_NAME}.avd/config.ini"
if [ -f "$AVD_CONFIG" ]; then
  sed -i "/^hw.ramSize=/d;/^hw.cpu.ncore=/d;/^disk.dataPartition.size=/d;/^vm.heapSize=/d" "$AVD_CONFIG"
  {
    echo "hw.ramSize=${EMULATOR_MEMORY_MB}"
    echo "hw.cpu.ncore=${EMULATOR_CORES}"
    echo "disk.dataPartition.size=${EMULATOR_PARTITION_MB}M"
    echo "vm.heapSize=512"
  } >> "$AVD_CONFIG"
fi

if [ "$REQUIRE_KVM" = "true" ] && [ ! -e /dev/kvm ]; then
  echo "KVM is required for this job, but /dev/kvm is not available in the runner container."
  echo "Configure the GitLab Docker runner with /dev/kvm device passthrough and privileged access, then retry android_device_test_upload."
  exit 1
fi

EMULATOR_ACCEL_ARGS="-accel on"
if [ "$REQUIRE_KVM" != "true" ] && [ ! -e /dev/kvm ]; then
  EMULATOR_ACCEL_ARGS="-accel off"
fi

emulator -avd "${AVD_NAME}" -no-window -no-audio -no-snapshot -wipe-data -gpu swiftshader_indirect -no-boot-anim $EMULATOR_ACCEL_ARGS -memory "${EMULATOR_MEMORY_MB}" -cores "${EMULATOR_CORES}" -partition-size "${EMULATOR_PARTITION_MB}" -no-metrics &
echo "Waiting for emulator device..."
if ! timeout 300s adb wait-for-device; then
  echo "Emulator device was not visible to adb before timeout"
  adb devices -l || true
  find /tmp /root/.android -name "emulator*.log" -type f -maxdepth 4 -print -exec tail -n 120 {} \; 2>/dev/null || true
  exit 1
fi

boot_deadline=$(($(now_seconds) + 420))
until [ "$(adb_shell_value getprop sys.boot_completed)" = "1" ]; do
  if [ "$(now_seconds)" -ge "$boot_deadline" ]; then
    echo "Emulator did not finish booting before timeout"
    timeout 20s adb shell getprop || true
    exit 1
  fi
  echo "Waiting for Android boot..."
  sleep 5
done

settings_deadline=$(($(now_seconds) + 120))
until timeout 10s adb shell settings get global window_animation_scale >/dev/null 2>&1; do
  if [ "$(now_seconds)" -ge "$settings_deadline" ]; then
    echo "Android settings service is not ready"
    timeout 20s adb shell service list || true
    exit 1
  fi
  echo "Waiting for Android settings service..."
  sleep 2
done

timeout 10s adb shell settings put global window_animation_scale 0
timeout 10s adb shell settings put global transition_animation_scale 0
timeout 10s adb shell settings put global animator_duration_scale 0
timeout 10s adb shell settings put system screen_off_timeout 2147483647 || true
timeout 10s adb shell svc power stayon true || true
timeout 10s adb shell input keyevent KEYCODE_WAKEUP || true
timeout 10s adb shell wm dismiss-keyguard || true
timeout 10s adb shell input keyevent 82 || true
timeout 10s adb shell input keyevent KEYCODE_HOME || true
timeout 10s adb shell rm -rf "/sdcard/Android/data/${ANDROID_APP_ID}/files/allure-results" || true

# Run instrumentation manually instead of Gradle connectedAndroidTest. Gradle/AGP
# can clean app data after the task, which removes app-specific external Allure
# files before the surrounding CI script gets a chance to adb pull them.
echo "Installing Android APKs..."
timeout 60s adb install -r "$ANDROID_APP_APK"
timeout 60s adb install -r "$ANDROID_TEST_APK"
timeout 10s adb shell rm -rf "/sdcard/Android/data/${ANDROID_APP_ID}/files/allure-results" || true
timeout 10s adb shell input keyevent KEYCODE_WAKEUP || true
timeout 10s adb shell wm dismiss-keyguard || true
timeout 10s adb shell input keyevent KEYCODE_HOME || true
timeout 10s adb shell am force-stop "${ANDROID_TEST_APP_ID}" || true
timeout 10s adb shell am force-stop "${ANDROID_APP_ID}" || true
timeout 20s adb shell monkey -p "${ANDROID_APP_ID}" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
sleep 2

ANDROID_RUN_VIDEO_REMOTE="${ANDROID_RUN_VIDEO_REMOTE:-/sdcard/Download/testhistory-full-run.mp4}"
timeout 10s adb shell rm -f "$ANDROID_RUN_VIDEO_REMOTE" || true
echo "Starting Android full-run screen recording..."
timeout 190s adb shell screenrecord --bit-rate 2500000 --size 720x1280 --time-limit 180 "$ANDROID_RUN_VIDEO_REMOTE" >/tmp/testhistory-screenrecord.log 2>&1 &
screenrecord_host_pid=$!
sleep 2

stop_screen_recording() {
  timeout 10s adb shell 'for pid in $(pidof screenrecord 2>/dev/null); do kill -2 $pid; done' || true
  if [ -n "${screenrecord_host_pid:-}" ]; then
    wait "$screenrecord_host_pid" || true
  fi
  timeout 10s adb shell ls -l "$ANDROID_RUN_VIDEO_REMOTE" || true
}

echo "Running Android instrumentation tests with ${ANDROID_TEST_APP_ID}/${ANDROID_TEST_RUNNER}..."
instrument_status=0
timeout "$ANDROID_TEST_TIMEOUT" adb shell am instrument -w -r "${ANDROID_TEST_APP_ID}/${ANDROID_TEST_RUNNER}" > "$ANDROID_INSTRUMENTATION_LOG" 2>&1 || instrument_status=$?
stop_screen_recording

if [ "$instrument_status" -ne 0 ]; then
  cat "$ANDROID_INSTRUMENTATION_LOG" || true
  echo "Android instrumentation tests failed or timed out after ${ANDROID_TEST_TIMEOUT}."
  exit 1
fi
cat "$ANDROID_INSTRUMENTATION_LOG"
if grep -E "^(FAILURES!!!|There were [0-9]+ failures:)|INSTRUMENTATION_RESULT: shortMsg=" "$ANDROID_INSTRUMENTATION_LOG" >/dev/null 2>&1; then
  echo "Android instrumentation reported failures."
  exit 1
fi
echo "Android instrumentation tests finished."
