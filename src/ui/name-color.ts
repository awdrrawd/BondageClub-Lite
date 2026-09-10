// Accept only BC hex colors; never insert player-controlled CSS expressions.
export function nameColor(value: unknown, member: number): string {
  const palette = ["#e9a5c6", "#9bcef1", "#b8dca0", "#e7c38a", "#c3b0ed", "#87d5cf"];
  if (typeof value !== "string" || !/^#[\da-f]{6}$/i.test(value)) return palette[Math.abs(member) % palette.length];
  let rgb = [1, 3, 5].map(offset => parseInt(value.slice(offset, offset + 2), 16));
  const luminance = (color: number[]) => color.map(n => { const v = n / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
  // Worst opaque message backing is #30213a (whisper); preserve hue by mixing with white.
  const background = luminance([48, 33, 58]);
  while ((luminance(rgb) + .05) / (background + .05) < 4.5) rgb = rgb.map(n => Math.min(255, n + Math.max(1, Math.ceil((255 - n) * .12))));
  return "#" + rgb.map(n => n.toString(16).padStart(2, "0")).join("");
}
