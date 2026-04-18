# @calab/cala-runtime

Browser-side orchestration primitives for the CaLa streaming demixing
pipeline. Workers (decoder, fit, extend, archive) import channel and
protocol types from here; numerics live in `@calab/core` (and the
`cala-core` WASM build).

Reference: `.planning/CALA_DESIGN.md §7` — worker topology, channel
design, mutation queue protocol, asset snapshot protocol.

## Module map

- `channel.ts` — SAB-backed single-producer/single-consumer ring for
  frame data (decoder → fit, fit → extend). [landed, task 15]
- `mutation-queue.ts` — bounded drop-oldest ring (extend → fit).
  [landed, task 16] Single-threaded TS port of the Rust `MutationQueue`;
  cross-worker SAB-backed version lands with the orchestrator (task 18).
- `asset-snapshot.ts` — extend↔fit snapshot request/ack protocol with
  correlation ids and ack-timeout diagnostics. [landed, task 17]
  Single-threaded in-memory transport; cross-worker SAB-backed version
  lands with the orchestrator (task 18).
- `events.ts` — `PipelineEvent` bus (birth / merge / split / deprecate
  / reject / metric) with drop-oldest backpressure, consumed by the
  archive worker. [landed, task 17]
- `orchestrator.ts` — spawns workers, wires channels, tracks epochs,
  owns two-pass toggle. [later task 18]
