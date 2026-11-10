import qrcode from 'qrcode';

export async function generateTerminalQR(text: string): Promise<string> {
  return qrcode.toString(text, {
    type: 'terminal',
    small: true,
  });
}

export async function generateSvgQR(text: string): Promise<string> {
  return qrcode.toString(text, {
    type: 'svg',
    margin: 1,
    width: 200,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });
}

export async function generateDataUrlQR(text: string): Promise<string> {
  return qrcode.toDataURL(text, {
    margin: 1,
    width: 240,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });
}
