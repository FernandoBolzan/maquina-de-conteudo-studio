/**
 * `macSigned` só importa no macOS: o Squirrel.Mac recusa instalar atualização sobre um app sem Developer ID (ad-hoc ou
 * sem assinatura), e o app baixaria ~110 MB a cada verificação só para falhar no fim.
 */
export function unsupportedUpdateMessage(platform: NodeJS.Platform, appImagePath?: string, macSigned?: boolean): string | undefined {
  if (platform === 'linux' && !appImagePath) {
    return 'No Linux, a atualização pelo app é suportada somente no formato AppImage. Atualize pacotes .deb pelo gerenciador de pacotes.';
  }
  if (platform === 'darwin' && macSigned !== true) {
    return 'No macOS, a atualização automática exige um app assinado com Apple Developer ID, e este build não é. Baixe a versão nova em github.com/FernandoBolzan/maquina-de-conteudo-studio/releases e substitua o app.';
  }
  return undefined;
}

/** Saída de `codesign -dv --verbose=2`: só um TeamIdentifier real indica Developer ID; ad-hoc mostra "not set". */
export function isDeveloperIdSigned(codesignOutput: string): boolean {
  return /^TeamIdentifier=(?!not set\b)\S+/m.test(codesignOutput);
}
