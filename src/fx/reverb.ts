/** Impulso estéreo de ruido con caída exponencial, para el ConvolverNode. */
export function makeImpulse(ctx: BaseAudioContext, seconds = 2.5): AudioBuffer {
  const length = Math.round(seconds * ctx.sampleRate);
  const buf = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
    }
  }
  return buf;
}
