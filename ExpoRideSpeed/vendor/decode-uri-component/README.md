# CommonJS adapter of decode-uri-component 0.5.0

This is the exact upstream scanner from commit `a12fabaa28303cc8b5b07e93d128f4fc09fc31e5`, with one change: its default ESM function export becomes `module.exports`. The algorithm is unchanged. `UPSTREAM.json` records the source URL, SHA-256, npm tarball and published integrity. The original MIT license is included.

The maintainer fixes CVE-2026-45822 in 0.5.0. There is no published 0.4.3. Version 0.5.0 is ESM, while Expo Router 57 currently uses query-string 7.1.3, whose CommonJS loader expects `require('decode-uri-component')` to return a function directly. The scoped npm override adapts only that dependency; it does not change Expo or Router versions. query-string converts `+` to spaces before calling the decoder, preserving its existing URL semantics.

The tests exercise real query-string parsing (Thai, encoded plus/delimiters, repeated parameters and malformed data), use a bounded subprocess for the previously expensive malformed-input case, and verify that reversing the export change reproduces the pinned upstream SHA-256. Keep these tests and provenance when updating. Remove the override when a compatible maintained upstream Router/query-string combination includes the fixed decoder.

Sources: [maintainer advisory](https://github.com/SamVerschueren/decode-uri-component/security/advisories/GHSA-vcc3-ghjq-m6fr), [0.5.0 release](https://github.com/SamVerschueren/decode-uri-component/releases/tag/v0.5.0), [pinned source](https://github.com/SamVerschueren/decode-uri-component/blob/a12fabaa28303cc8b5b07e93d128f4fc09fc31e5/index.js).
