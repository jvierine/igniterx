# IgniteRX — Rakke telemetry lab

Live at **https://juha.no/igniterx/**.

A Rust/WebAssembly flight and RF simulation with a Three.js WebGL viewer for IgniteUiT Rakke rocket communications at 868 MHz.

## Features

- Powered flight with constant mass flow, followed by ballistic coast and descent; exhaust velocity calibrated to a 3 km apogee.
- Adjustable launch angle (20° zenith default), flight position, and receive-array reference point.
- Five 5.5 dBi circularly polarized patches in a cross, with spacing from 0.5–2 wavelengths, feeding five coherent KrakenSDR channels.
- Ideal electronic rocket tracking; reference-point search to maximize worst sampled link margin.
- Three equally fed axial half-wave dipoles at 120° intervals around the cone, with adjustable chord spacing, roll, and total radiated power (25 mW default).
- Friis link budget including directional Tx and Rx gains, polarization mismatch, feed loss, kTB noise, LoRa SNR thresholds, and demodulation reserve.
- LoRa nominal coded PHY rate from 18.3 b/s to 37.5 kb/s; automatic SF6–12 / 7.8–500 kHz mode selection at CR 4/5.
- Rocket cone and elevated ground-array close-ups, antenna surfaces, elevation and azimuth cuts, full angular gain maps, finite-width −3 dB array and fixed single-patch beam volumes, margin along the flight, time-weighted average and sampled worst case, CSV export, shareable parameter URLs.

## Build directly on juha.no

Development and verification use the public URL; no local web server is needed.

```sh
ssh j@juha.no
cd ~/src/igniterx
export PATH="$HOME/.local/igniterx-tools/node-v22.20.0-linux-x64/bin:$HOME/.cargo/bin:$PATH"
npm ci
npm run build
npm test
npm run deploy
```

Prerequisites: Node.js 22+, Rust with `wasm32-unknown-unknown`, rsync. Rust has no crate dependencies. A production build is a static `dist/` directory, deployed into `/var/www/html/igniterx/` with Vite's `/igniterx/` base. The Rust module is compiled to WebAssembly and bundled under a content-hashed filename. There is no backend service.

Files:
- `physics/src/lib.rs`: flight dynamics, antenna fields, normalization, Friis, LoRa selection, optimization, native tests.
- `src/model.ts`: numeric WebAssembly ABI and SI-unit output schema.
- `src/scene.ts`: WebGL trajectory and antenna surfaces.
- `src/charts.ts`: SVG link margin and polar cuts.
- `src/main.ts`: controls and readouts.
- `scripts/wasm.test.mjs`: tests of the actual browser WebAssembly build.

## Modeling assumptions

The UI uses the [Project Rakke](https://igniteuit.no/rakke) logo and charcoal/teal theme. Technical assumptions are documented below. Wet/dry mass is 12/8 kg, burn time 4 s, mass flow 1 kg/s; drag, wind, recovery parachute, Earth curvature, and tumbling are omitted. The schematic coastline is not surveyed terrain, and no particular Rakke pad is asserted. The station is behind the pad with 150 m crossrange offset and a 2 m antenna height.

Tx elements are ideal parallel, axial half-wave dipoles with equal phases and amplitudes, at vertices of an equilateral triangle. Their summed complex field is normalized by a spherical power integral to fixed total radiated power. Half-wave dipole length is 17.27 cm; spacing is nearest-neighbor chord length, not ring radius. Coupling, cone scattering, and efficiency are omitted.

Rx elements use an assumed cosine-squared front-hemisphere power envelope with 5.5 dBi peak. Digital combining uses `|sum|²/5`, giving 6.99 dB ideal SNR improvement at the steering direction with independent equal receiver noise. The baseline uses one patch without combining. Exact ideal nulls are floored at −150 dBi; 601 flight samples may miss very narrow nulls. The tilt optimizer searches 101 reference flight times.

The dipoles are linearly polarized; ideal circular receive patches incur 3.01 dB polarization loss. Tsys is total equivalent system temperature; no separate noise figure is added. LoRa rates are nominal coded PHY rates, not payload throughput. SF6 assumes implicit header operation. Semtech modem SNR thresholds are estimates for a software decoder after KrakenSDR combining, not measured KrakenSDR sensitivity. Quantization, interference, correlated channel noise and calibration error are omitted. Doppler is displayed but not charged against link margin.

Sources: [Semtech SX1276 datasheet](https://cdn.sparkfun.com/assets/7/7/3/2/2/SX1276_Datasheet.pdf), [Semtech LoRa FAQ](https://www.semtech.com/design-support/faq/faq-lora/P60), [KrakenRF hardware](https://www.krakenrf.com/product-page/krakensdr), [Andøya sounding rocket range](https://andoyaspace.no/suborbital/sounding-rocket-launch-services/).

## License

MIT for the application code. Rakke mission artwork is attributed to [Project Rakke / IgniteUiT](https://igniteuit.no/rakke).

The reference point slider is immediately below the flight-time slider. The single-patch envelope is independent of all combining weights and remains fixed as the rocket moves; its full half-power beamwidth is 90 degrees for the assumed cosine-squared patch model. The array beam uses the calculated −3 dB contour around the electronic steering direction, including the element envelope and steering weights. At 2 wavelengths spacing, the broadside receive-array factor has an equal-height grating replica at theta = 30 degrees in a principal plane (the patch envelope reduces total gain there by 1.25 dB). At 0.5 wavelengths broadside spacing there is no equivalent interior grating replica; emergence depends on scan angle as well as spacing.

The three dipoles remain a coherent complex field sum. For a phi = 90-degree cut the ring-array factor is proportional to (1 + 2 cos(pi d sin(theta)))^2. At d = 1 wavelength an interference null occurs at theta = asin(2/3), away from the individual dipole axial null. Three dipoles do not imply exactly three minima in every angular cut. The full map and azimuth cut expose the actual symmetry.
