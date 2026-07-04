// Oyun durumu: seçim, harf girişi, kelime kontrolü, ilerleme.
import { slotCells } from './board.js';
import { sound } from './effects.js';

const TR_LETTERS = 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ';

const ARROW_GLYPH = {
  right: '→', down: '↓', rightDown: '↴', downRight: '↳',
};
const DIR_LABEL = { A: 'Soldan sağa', D: 'Yukarıdan aşağıya' };

export class Game {
  constructor({ puzzle, board, particles, onProgress, onVictory, onSelect, focusWord }) {
    this.puzzle = puzzle;
    this.board = board;
    this.particles = particles;
    this.onProgress = onProgress;
    this.onVictory = onVictory;
    this.onSelect = onSelect;
    this.focusWord = focusWord;

    this.entries = {};            // "r,c" -> harf
    this.solved = new Set();      // slot id
    this.selected = null;         // slot
    this.cursor = 0;              // seçili slottaki indeks
    this.hints = 0;
    this.startedAt = performance.now();
    this.finished = false;

    // hücre -> slotlar dizini
    this.slotsAt = {};
    for (const slot of puzzle.slots) {
      for (const [r, c] of slotCells(slot)) {
        (this.slotsAt[`${r},${c}`] = this.slotsAt[`${r},${c}`] || []).push(slot);
      }
    }
  }

  /* ---------- seçim ---------- */
  clickCell(r, c) {
    const data = this.puzzle.cells[r][c];
    if (data.t === 'C') {
      // ipucu hücresi: sıradaki çözülmemiş ipucusunu seç
      const ids = data.clues.map(cl => cl.slot);
      const open = ids.filter(id => !this.solved.has(id));
      const pick = open.length ? open : ids;
      let idx = 0;
      if (this.selected && ids.includes(this.selected.id)) {
        idx = (pick.indexOf(this.selected.id) + 1) % pick.length;
      }
      this.selectSlot(this.puzzle.slots[pick[idx]]);
      return;
    }
    if (data.t !== 'L') return;
    const options = this.slotsAt[`${r},${c}`] || [];
    if (!options.length) return;
    let slot = options[0];
    if (options.length > 1) {
      const openOpts = options.filter(s => !this.solved.has(s.id));
      const pool = openOpts.length ? openOpts : options;
      if (this.selected && options.some(s => s.id === this.selected.id)) {
        // aynı hücreye tekrar tıklanınca yön değiştir
        const cur = pool.findIndex(s => s.id === this.selected.id);
        slot = pool[(cur + 1) % pool.length];
      } else slot = pool[0];
    }
    this.selectSlot(slot, this._indexInSlot(slot, r, c));
  }

  _indexInSlot(slot, r, c) {
    return slotCells(slot).findIndex(([rr, cc]) => rr === r && cc === c);
  }

  selectSlot(slot, cursorAt) {
    if (!slot) return;
    // eski ipucu hücresi vurgusunu kapat
    if (this.selected) this.board.highlightClueCell(this.selected.clueR, this.selected.clueC, false);
    this.selected = slot;
    const cells = slotCells(slot);
    if (cursorAt == null || cursorAt < 0) {
      cursorAt = 0;
      if (!this.solved.has(slot.id)) {
        const empty = cells.findIndex(([r, c]) => !this.entries[`${r},${c}`]);
        if (empty >= 0) cursorAt = empty;
      }
    }
    this.cursor = cursorAt;
    this.board.setSelection(cells, cells[this.cursor]);
    this.board.highlightClueCell(slot.clueR, slot.clueC, true);
    sound.select();
    this.onSelect && this.onSelect(this._clueInfo(slot));
    this.focusWord && this.focusWord(cells.map(([r, c]) => this.board.worldOf(r, c)));
  }

  _clueInfo(slot) {
    return {
      arrow: ARROW_GLYPH[slot.arrow] || '→',
      dirLabel: DIR_LABEL[slot.dir],
      clue: slot.clue,
      emoji: slot.emoji,
      len: slot.len,
      solved: this.solved.has(slot.id),
    };
  }

  /* ---------- giriş ---------- */
  type(ch) {
    if (this.finished || !this.selected) return;
    ch = ch.toLocaleUpperCase('tr');
    if (!TR_LETTERS.includes(ch)) return;
    const cells = slotCells(this.selected);
    // imleci kilitli olmayan hücreye getir
    let i = this.cursor;
    while (i < cells.length && this.board.locked.has(cells[i].join(','))) i++;
    if (i >= cells.length) return;
    const [r, c] = cells[i];
    this.entries[`${r},${c}`] = ch;
    this.board.setLetter(r, c, ch);
    sound.place();
    // sonraki serbest hücre
    let n = i + 1;
    while (n < cells.length && this.board.locked.has(cells[n].join(','))) n++;
    this.cursor = Math.min(n, cells.length - 1);
    this.board.setSelection(cells, n < cells.length ? cells[n] : null);
    this._checkAround(r, c);
  }

  backspace() {
    if (this.finished || !this.selected) return;
    const cells = slotCells(this.selected);
    let i = this.cursor;
    const keyAt = j => cells[j].join(',');
    if (i >= cells.length) i = cells.length - 1;
    // imleç boşsa bir geri git
    if (!this.entries[keyAt(i)] || this.board.locked.has(keyAt(i))) {
      let p = i - 1;
      while (p >= 0 && this.board.locked.has(keyAt(p))) p--;
      if (p < 0) return;
      i = p;
    }
    if (this.board.locked.has(keyAt(i))) return;
    const [r, c] = cells[i];
    delete this.entries[`${r},${c}`];
    this.board.setLetter(r, c, '');
    this.cursor = i;
    this.board.setSelection(cells, cells[i]);
    sound.erase();
  }

  moveCursor(delta) {
    if (!this.selected) return;
    const cells = slotCells(this.selected);
    this.cursor = Math.max(0, Math.min(cells.length - 1, this.cursor + delta));
    this.board.setSelection(cells, cells[this.cursor]);
  }

  hint() {
    if (this.finished) return;
    let slot = this.selected;
    if (!slot || this.solved.has(slot.id)) {
      slot = this.puzzle.slots.find(s => !this.solved.has(s.id));
      if (!slot) return;
      this.selectSlot(slot);
    }
    const cells = slotCells(slot);
    // imleçten başlayarak ilk yanlış/boş hücre
    let target = -1;
    for (let j = 0; j < cells.length; j++) {
      const jj = (this.cursor + j) % cells.length;
      const [r, c] = cells[jj];
      if (this.board.locked.has(`${r},${c}`)) continue;
      if (this.entries[`${r},${c}`] !== slot.word[jj]) { target = jj; break; }
    }
    if (target < 0) return;
    const [r, c] = cells[target];
    this.hints++;
    this.entries[`${r},${c}`] = slot.word[target];
    this.board.setLetter(r, c, slot.word[target]);
    this.particles.burst(this.board.worldOf(r, c, 0.5), 0x63d8ff, 20, 2.2);
    sound.hint();
    this.cursor = target;
    this.board.setSelection(cells, cells[target]);
    this._checkAround(r, c);
  }

  /* ---------- kontrol ---------- */
  _checkAround(r, c) {
    // bu hücreyi içeren tüm slotlar dolduysa denetle
    const affected = this.slotsAt[`${r},${c}`] || [];
    for (const slot of affected) this._checkSlot(slot);
    // seçili slotun ipucu panelini tazele
    if (this.selected) this.onSelect && this.onSelect(this._clueInfo(this.selected));
  }

  _checkSlot(slot) {
    if (this.solved.has(slot.id)) return;
    const cells = slotCells(slot);
    let word = '';
    for (const [r, c] of cells) {
      const ch = this.entries[`${r},${c}`];
      if (!ch) return;                    // henüz eksik
      word += ch;
    }
    if (word === slot.word) {
      this.solved.add(slot.id);
      this.board.lockSlot(slot, slot.word);
      sound.correct();
      this.onProgress && this.onProgress(this.solved.size, this.puzzle.slots.length, slot);
      // çaprazda tamamlananlar da denetlensin
      if (this.solved.size === this.puzzle.slots.length) this._win();
    } else if (slot === this.selected) {
      this.board.wrongSlot(slot);
      sound.wrong();
    }
  }

  _win() {
    this.finished = true;
    const secs = Math.round((performance.now() - this.startedAt) / 1000);
    this.board.setSelection([], null);
    if (this.selected) this.board.highlightClueCell(this.selected.clueR, this.selected.clueC, false);
    this.onVictory && this.onVictory({ secs, hints: this.hints });
  }

  elapsed() {
    return Math.round((performance.now() - this.startedAt) / 1000);
  }
}

export { TR_LETTERS };
