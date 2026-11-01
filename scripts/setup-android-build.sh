#!/usr/bin/env bash
# One-time setup for building the Bench Android APK locally on Ubuntu 24.04.
# Versions match the project: Node 22.13+, JDK 17, Android platform 37,
# build-tools 37.0.0, NDK 27.1.12297006, CMake 3.22.1.
set -euo pipefail

sudo apt-get update
sudo apt-get install -y openjdk-17-jdk-headless unzip zip curl ca-certificates

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

export ANDROID_HOME="$HOME/Android/Sdk"
mkdir -p "$ANDROID_HOME/cmdline-tools"
cd /tmp
curl -fsSLO https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
rm -rf "$ANDROID_HOME/cmdline-tools/latest"
unzip -q -o commandlinetools-linux-11076708_latest.zip -d "$ANDROID_HOME/cmdline-tools"
mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"

SDKMANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
yes | "$SDKMANAGER" --licenses >/dev/null
"$SDKMANAGER" "platform-tools" "platforms;android-37" "build-tools;37.0.0" \
  "ndk;27.1.12297006" "cmake;3.22.1"

if ! grep -q "ANDROID_HOME" "$HOME/.bashrc"; then
  cat >> "$HOME/.bashrc" <<'ENV'
export ANDROID_HOME="$HOME/Android/Sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"
ENV
fi

echo "Setup finished. Run: source ~/.bashrc"
