import type { LocalVoiceEngine } from './contracts.js';

export interface LocalVoiceAsset {
  path: string;
  url: string;
  sizeBytes: number;
  digest: string;
  digestType: 'sha256' | 'git-blob-sha1';
  fileName: string;
}
export interface LocalVoiceManifestEntry {
  id: string;
  engine: LocalVoiceEngine;
  modelId: string;
  voiceId: string;
  name: string;
  language: string;
  quality: string;
  license: string;
  licenseEvidence: string;
  sizeBytes: number;
  assets: LocalVoiceAsset[];
  runtimeSizeBytes: number;
  attribution?: string;
}

const PIPER_REVISION = '6b9cfaacb4fb2e02a9621227e3c1a48bec9710c3';

export const LOCAL_VOICE_MANIFEST = {
  schemaVersion: 2,
  sources: {
    piperModels: { repository: 'rhasspy/piper-voices', revision: PIPER_REVISION },
    piperSamples: {
      repository: 'rhasspy/piper-samples', revision: 'edf9afb0f91b36d5ce8458dd8d14782822a09b3a',
      inventoryBlob: '613d5d0c3d35f3f145257fab3bd6cd7430dec575', inventorySizeBytes: 251021, sourceVoiceCount: 182,
    },
    piperReference: {
      repository: 'rhasspy/piper', revision: '73c04d81d5590ecc46e522de3601ce7fb29fc2be',
      referenceBlob: '34e9f5e9fc7729cdd62a8fff4e81d3fc3a082a1e', referenceSizeBytes: 44563,
    },
    kokoroSource: {
      repository: 'hexgrad/Kokoro-82M', revision: 'f3ff3571791e39611d31c381e3a41a3af07b4987',
      inventoryBlob: 'ed78a806ffa121525449a848624600eae34037c7', inventorySizeBytes: 7625, sourceVoiceCount: 54,
      runtimeSupportedVoiceCount: 54, runtimeWheelBytes: 48229424,
      voiceBundleObservedSha256: 'bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d',
      sourceReadmeEvidence: 'https://files.pythonhosted.org/packages/60/e1/a27e5a70a525a5ee1fd5357596f07b724d02ff317f134e86cb6e3d9db968/kokoro_onnx-0.6.1-py3-none-any.whl',
      sourceReadmeWheelSha256: '50c8de4950d601df41428ee5462a48c8a78bef441bf671f2492e070ef44d8a32',
    },
    kokoroAssets: {
      repository: 'thewh1teagle/kokoro-onnx',
      modelAssetId: 520133700, modelUrl: 'https://api.github.com/repos/thewh1teagle/kokoro-onnx/releases/assets/520133700',
      modelFileName: 'kokoro-v1.0.onnx', modelSizeBytes: 325505369,
      modelSha256: 'beb0d1848dee9a49da392cc3df26958d46cfa35d321edf434f52949153f0df3a',
      voicesAssetId: 520134664, voicesUrl: 'https://api.github.com/repos/thewh1teagle/kokoro-onnx/releases/assets/520134664',
      voicesFileName: 'voices-v1.0.bin', voicesSizeBytes: 28214398,
      voicesSha256: 'bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d',
      modelLicense: 'Apache-2.0',
      licenseEvidenceWheel: 'https://files.pythonhosted.org/packages/60/e1/a27e5a70a525a5ee1fd5357596f07b724d02ff317f134e86cb6e3d9db968/kokoro_onnx-0.6.1-py3-none-any.whl',
      licenseEvidenceWheelSha256: '50c8de4950d601df41428ee5462a48c8a78bef441bf671f2492e070ef44d8a32',
      licenseEvidenceSection: 'kokoro-onnx 0.6.1 wheel METADATA: installation explicitly downloads these two assets and License section identifies kokoro model as Apache 2.0.',
    },
  },
  kokoroVoiceSource: [
    ['af_heart', 'en-US', 'A', '0ab5709b'], ['af_alloy', 'en-US', 'C', '6d877149'], ['af_aoede', 'en-US', 'C+', 'c03bd1a4'],
    ['af_bella', 'en-US', 'A-', '8cb64e02'], ['af_jessica', 'en-US', 'D', 'cdfdccb8'], ['af_kore', 'en-US', 'C+', '8bfbc512'],
    ['af_nicole', 'en-US', 'B-', 'c5561808'], ['af_nova', 'en-US', 'C', 'e0233676'], ['af_river', 'en-US', 'D', 'e149459b'],
    ['af_sarah', 'en-US', 'C+', '49bd364e'], ['af_sky', 'en-US', 'C-', 'c799548a'], ['am_adam', 'en-US', 'F+', 'ced7e284'],
    ['am_echo', 'en-US', 'D', '8bcfdc85'], ['am_eric', 'en-US', 'D', 'ada66f0e'], ['am_fenrir', 'en-US', 'C+', '98e507ec'],
    ['am_liam', 'en-US', 'D', 'c8255075'], ['am_michael', 'en-US', 'C+', '9a443b79'], ['am_onyx', 'en-US', 'D', 'e8452be1'],
    ['am_puck', 'en-US', 'C+', 'dd1d8973'], ['am_santa', 'en-US', 'D-', '7f2f7582'],
    ['bf_alice', 'en-GB', 'D', 'd292651b'], ['bf_emma', 'en-GB', 'B-', 'd0a423de'], ['bf_isabella', 'en-GB', 'C', 'cdd4c370'],
    ['bf_lily', 'en-GB', 'D', '6e09c2e4'], ['bm_daniel', 'en-GB', 'D', 'fc3fce4e'], ['bm_fable', 'en-GB', 'C', 'd44935f3'],
    ['bm_george', 'en-GB', 'C', 'f1bc8122'], ['bm_lewis', 'en-GB', 'D+', 'b5204750'],
    ['jf_alpha', 'ja-JP', 'C+', '1bf4c9dc'], ['jf_gongitsune', 'ja-JP', 'C', '1b171917'], ['jf_nezumi', 'ja-JP', 'C-', 'd83f007a'],
    ['jf_tebukuro', 'ja-JP', 'C', '0d691790'], ['jm_kumo', 'ja-JP', 'C-', '98340afd'],
    ['zf_xiaobei', 'zh-CN', 'D', '9b76be63'], ['zf_xiaoni', 'zh-CN', 'D', '95b49f16'], ['zf_xiaoxiao', 'zh-CN', 'D', 'cfaf6f2d'],
    ['zf_xiaoyi', 'zh-CN', 'D', 'b5235dba'], ['zm_yunjian', 'zh-CN', 'D', '76cbf8ba'], ['zm_yunxi', 'zh-CN', 'D', 'dbe6e1ce'],
    ['zm_yunxia', 'zh-CN', 'D', 'bb2b03b0'], ['zm_yunyang', 'zh-CN', 'D', '5238ac22'],
    ['ef_dora', 'es-ES', null, 'd9d69b0f'], ['em_alex', 'es-ES', null, '5eac53f7'], ['em_santa', 'es-ES', null, 'aa8620cb'],
    ['ff_siwis', 'fr-FR', 'B-', '8073bf2d'], ['hf_alpha', 'hi-IN', 'C', '06906fe0'], ['hf_beta', 'hi-IN', 'C', '63c0a1a6'],
    ['hm_omega', 'hi-IN', 'C', 'b55f02a8'], ['hm_psi', 'hi-IN', 'C', '2f0f055c'], ['if_sara', 'it-IT', 'C', '6c0b253b'],
    ['im_nicola', 'it-IT', 'C', '234ed066'], ['pf_dora', 'pt-BR', null, '07e4ff98'], ['pm_alex', 'pt-BR', null, 'cf0ba8c5'],
    ['pm_santa', 'pt-BR', null, 'd4210316'],
  ],
  kokoroBundleVoiceIds: [
    'af_heart', 'af_alloy', 'af_aoede', 'af_bella', 'af_jessica', 'af_kore', 'af_nicole', 'af_nova', 'af_river', 'af_sarah', 'af_sky',
    'am_adam', 'am_echo', 'am_eric', 'am_fenrir', 'am_liam', 'am_michael', 'am_onyx', 'am_puck', 'am_santa',
    'bf_alice', 'bf_emma', 'bf_isabella', 'bf_lily', 'bm_daniel', 'bm_fable', 'bm_george', 'bm_lewis',
    'ef_dora', 'em_alex', 'em_santa', 'ff_siwis', 'hf_alpha', 'hf_beta', 'hm_omega', 'hm_psi', 'if_sara', 'im_nicola',
    'jf_alpha', 'jf_gongitsune', 'jf_nezumi', 'jf_tebukuro', 'jm_kumo', 'pf_dora', 'pm_alex', 'pm_santa',
    'zf_xiaobei', 'zf_xiaoni', 'zf_xiaoxiao', 'zf_xiaoyi', 'zm_yunjian', 'zm_yunxi', 'zm_yunxia', 'zm_yunyang',
  ],
  kokoroRuntimeVoiceIds: [
    'af_heart', 'af_alloy', 'af_aoede', 'af_bella', 'af_jessica', 'af_kore', 'af_nicole', 'af_nova', 'af_river', 'af_sarah', 'af_sky',
    'am_adam', 'am_echo', 'am_eric', 'am_fenrir', 'am_liam', 'am_michael', 'am_onyx', 'am_puck', 'am_santa',
    'bf_alice', 'bf_emma', 'bf_isabella', 'bf_lily', 'bm_daniel', 'bm_fable', 'bm_george', 'bm_lewis',
    'ef_dora', 'em_alex', 'em_santa', 'ff_siwis', 'hf_alpha', 'hf_beta', 'hm_omega', 'hm_psi', 'if_sara', 'im_nicola',
    'jf_alpha', 'jf_gongitsune', 'jf_nezumi', 'jf_tebukuro', 'jm_kumo', 'pf_dora', 'pm_alex', 'pm_santa',
    'zf_xiaobei', 'zf_xiaoni', 'zf_xiaoxiao', 'zf_xiaoyi', 'zm_yunjian', 'zm_yunxi', 'zm_yunxia', 'zm_yunyang',
  ],
  voices: [] as LocalVoiceManifestEntry[],
  exclusions: [
    {
      source: 'Inventário de vozes Piper: 182 entradas em rhasspy/piper-samples@edf9afb0f91b36d5ce8458dd8d14782822a09b3/voices.json',
      reason: 'O inventário não contém evidências de licença dos modelos. O cartão do modelo LibriTTS-R consultado identifica CC BY 4.0 apenas como licença do conjunto de dados de treinamento; isso não concede uma licença aplicável aos pesos ONNX do Piper distribuídos separadamente. Nenhum modelo Piper pode ser selecionado até que a permissão de distribuição/uso do próprio modelo seja estabelecida e seus assets exatos sejam fixados.',
    },
    {
      source: 'Conjunto de wheels do runtime Kokoro em resources/kokoro-wheel-artifacts.json',
      reason: 'O conjunto candidato para Linux x86_64 contém 17 wheels exatos e fixados, mas espeakng-loader 0.2.4 inclui libespeak-ng.so e dados de voz. A licença MIT do projeto upstream abrange apenas o código do loader; a revisão de origem do eSpeak-NG, o arquivo COPYING, os termos dos dados de voz e os avisos de licença preservados não foram comprovados. O runtime fica desativado até que essas evidências estejam disponíveis; além disso, ainda não foi aprovado um teste nativo de síntese em CPU com CPython 3.11.',
    },
  ],
} as const;
