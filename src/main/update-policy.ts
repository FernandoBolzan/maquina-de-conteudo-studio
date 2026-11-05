export function unsupportedUpdateMessage(platform: NodeJS.Platform, appImagePath?: string): string | undefined {
  if (platform === 'linux' && !appImagePath) {
    return 'No Linux, a atualização pelo app é suportada somente no formato AppImage. Atualize pacotes .deb pelo gerenciador de pacotes.';
  }
  return undefined;
}
