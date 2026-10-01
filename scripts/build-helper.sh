#!/bin/sh
# Build the CoreAudio helper as a universal (Apple silicon + Intel) binary.
set -eu
cd "$(dirname "$0")/.."
mkdir -p build com.pdito.mic-lock.sdPlugin/bin
for arch in arm64 x86_64; do
  swiftc -O -target "$arch-apple-macos13" helper/main.swift -o "build/miclock-$arch"
done
lipo -create build/miclock-arm64 build/miclock-x86_64 -output com.pdito.mic-lock.sdPlugin/bin/miclock
codesign --force --sign - com.pdito.mic-lock.sdPlugin/bin/miclock
echo "Built com.pdito.mic-lock.sdPlugin/bin/miclock"
