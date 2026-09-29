// Ícones de traço do site, em SVG inline: nenhum arquivo extra, nenhuma fonte
// de ícones de terceiros, e a cor vem de `currentColor`.
//
// Poucos e só onde ajudam a reconhecer um canal de relance — WhatsApp,
// telefone, e-mail, endereço. Ícone decorativo em todo título é o que faz um
// site parecer modelo pronto.

const svg = (conteudo, { fill = false } = {}) =>
  `<svg class="icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false"${fill
    ? ' fill="currentColor"'
    : ' fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"'}>${conteudo}</svg>`;

export const ICONE = {
  whatsapp: svg(
    '<path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35z"/>' +
    '<path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.83 9.83 0 0 0 12.04 2zm0 18.15h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.16 8.16 0 0 1-1.25-4.38c0-4.54 3.7-8.23 8.24-8.23a8.18 8.18 0 0 1 5.82 2.42 8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.69 8.23-8.23 8.23z"/>',
    { fill: true }),
  telefone: svg(
    '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>'),
  email: svg('<path d="M3.5 5.5h17v13h-17z"/><path d="M3.5 6.5 12 13l8.5-6.5"/>'),
  local: svg(
    '<path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.3"/>'),
  relogio: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  // Seta de canto: o link abre fora do site (WhatsApp, mapa, cliente de e-mail).
  externo: svg('<path d="M8 16 16 8"/><path d="M9.5 8H16v6.5"/>'),
  linkedin: svg(
    '<path d="M3.5 9h3.8v12H3.5zM5.4 3a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4zM9.6 9h3.6v1.7h.1c.5-1 1.8-2 3.6-2 3.9 0 4.6 2.5 4.6 5.8V21h-3.8v-5.8c0-1.4 0-3.2-1.9-3.2s-2.2 1.5-2.2 3.1V21H9.6z"/>',
    { fill: true }),
  facebook: svg(
    '<path d="M13.6 21v-8.2h2.8l.4-3.2h-3.2V7.5c0-.9.3-1.6 1.6-1.6h1.7V3.1a23 23 0 0 0-2.5-.1c-2.5 0-4.2 1.5-4.2 4.3v2.3H7.4v3.2h2.8V21z"/>',
    { fill: true }),
  link: svg(
    '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>'),
};
