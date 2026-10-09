#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
cargo build --release --target wasm32-unknown-unknown --manifest-path physics/Cargo.toml
cp physics/target/wasm32-unknown-unknown/release/igniterx_physics.wasm src/physics.wasm
