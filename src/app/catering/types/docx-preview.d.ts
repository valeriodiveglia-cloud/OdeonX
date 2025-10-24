declare module 'docx-preview' {
  export function renderAsync(
    arrayBuffer: ArrayBuffer,
    container: HTMLElement,
    style?: any,
    options?: {
      className?: string
      inWrapper?: boolean
      ignoreWidth?: boolean
      ignoreHeight?: boolean
      ignoreFonts?: boolean
      breakPages?: boolean
      trimXmlDeclaration?: boolean
    }
  ): Promise<void>
}