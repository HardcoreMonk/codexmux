let audioContext: AudioContext | null = null;

const getAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;

  const AudioContextCtor = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;

  try {
    audioContext ??= new AudioContextCtor();
    return audioContext;
  } catch {
    return null;
  }
};

export const playCompletionSound = (): void => {
  const ctx = getAudioContext();
  if (!ctx) return;

  const play = () => {
    const start = ctx.currentTime + 0.01;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.08, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
    gain.connect(ctx.destination);

    [
      { frequency: 880, offset: 0, duration: 0.08 },
      { frequency: 1174.66, offset: 0.1, duration: 0.12 },
    ].forEach((tone, index, tones) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(tone.frequency, start + tone.offset);
      osc.connect(gain);
      osc.start(start + tone.offset);
      osc.stop(start + tone.offset + tone.duration);
      if (index === tones.length - 1) {
        osc.onended = () => gain.disconnect();
      }
    });
  };

  if (ctx.state === 'suspended') {
    ctx.resume().then(play).catch(() => {});
    return;
  }

  play();
};
