import { padAction, type Action, type Gesture } from '../controls';

/**
 * Decide qué hace cada gesto de pad según el modo (normal o notas).
 * Un pad mantenido conserva el modo con el que se presionó, para que cambiar
 * de modo con un pad abajo no deje el stutter pegado ni borre un loop.
 */
export class PadRouter {
  private noteMode = false;
  private modeAtDown = new Map<number, boolean>();
  private heldNotes: number[] = [];

  constructor(
    private dispatch: (a: Action) => void,
    private setPressed: (pad: number, on: boolean) => void,
  ) {}

  setNoteMode(on: boolean): void {
    this.noteMode = on;
  }

  gesture(pad: number, g: Gesture): void {
    if (g === 'tap') this.modeAtDown.set(pad, this.noteMode);
    const notes = this.modeAtDown.get(pad) ?? this.noteMode;
    if (g === 'release') this.modeAtDown.delete(pad);

    if (!notes) {
      const a = padAction(pad, g);
      if (a) this.dispatch(a);
      return;
    }
    if (g === 'tap') {
      this.heldNotes = this.heldNotes.filter((p) => p !== pad);
      this.heldNotes.push(pad);
      this.setPressed(pad, true);
      this.dispatch({ type: 'notePress', index: pad });
    } else if (g === 'release') {
      this.heldNotes = this.heldNotes.filter((p) => p !== pad);
      this.setPressed(pad, false);
      const back = this.heldNotes.at(-1);
      this.dispatch(back === undefined ? { type: 'noteRelease', index: pad } : { type: 'notePress', index: back });
    }
  }
}
