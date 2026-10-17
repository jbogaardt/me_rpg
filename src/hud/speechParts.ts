// How a caption is cut up to be spoken (Pixi-free, tested): a sentence at a time, so no engine has to say a long speech in
// one go (some browsers cut a long utterance off after about 15 seconds, and a neural voice answers sooner for a short one).

/** The sentences of `text` in order, each trimmed; none is empty. */
export function speechParts(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]*/g) ?? [text]).map((s) => s.trim()).filter(Boolean);
}
