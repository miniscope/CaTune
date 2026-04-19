export { parseNpy } from './npy-parser.ts';
export { writeNpy } from './npy-writer.ts';
export { parseNpz } from './npz-parser.ts';
export { validateTraceData } from './validation.ts';
export { extractCellTrace, processNpyResult } from './array-utils.ts';
export { rankCellsByActivity, sampleRandomCells } from './cell-ranking.ts';
export { buildExportData, downloadExport, parseExport } from './export.ts';
export type { CaTuneExport } from './export.ts';
export {
  getBridgeUrl,
  fetchBridgeData,
  fetchBridgeConfig,
  postParamsToBridge,
  postProgressToBridge,
  exportCaDeconToBridge,
  startBridgeHeartbeat,
  stopBridgeHeartbeat,
} from './bridge.ts';
export type { BridgeMetadata, BridgeConfig, BridgeProgress } from './bridge.ts';

// CaLa frame sources (design §10): generic random-access frame input
// the decoder worker reads from. Phase 5 ships `avi-uncompressed`;
// TIFF / compressed AVI / MP4 implementations plug into the same
// `FrameSource` contract later.
export {
  FrameOutOfRangeError,
  FrameSourceParseError,
  type FrameSource,
  type FrameSourceMeta,
  type GrayscaleMethod,
} from './frame-source.ts';
export { openAviUncompressed, openAviUncompressedFromBytes } from './avi-uncompressed.ts';
