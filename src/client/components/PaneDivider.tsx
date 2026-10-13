/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * A bounded divider between the message list and reader, below the top bar.
 *
 * @module client/components/PaneDivider
 */
import {createSignal, onCleanup, onMount} from 'solid-js';
import {t} from '../../shared/i18n';
import {mode} from '../store';

/** Resizes the list with a pointer or the arrow keys, keeping the reader usable. */
export function PaneDivider() {
  let divider!: HTMLDivElement;
  let app!: HTMLElement;
  let list!: HTMLElement;
  let requested: number | undefined;
  let pointer: {id: number; x: number; width: number} | null = null;
  const [width, setWidth] = createSignal(340);
  const [limits, setLimits] = createSignal({min: 300, max: 400});

  /** Applies a width within the current layout's bounds. */
  function resize(value: number): void {
    const {min, max} = limits();
    requested = Math.max(min, Math.min(max, value));
    app.style.setProperty('--list-width', `${requested}px`);
    setWidth(requested);
  }

  /** Measures the layout and keeps at least 320 pixels for the reader. */
  function measure(): void {
    if (app.clientWidth < 700) return;
    const wide = mode === 'app' && matchMedia('(min-width: 1100px)').matches;
    setLimits({min: wide ? 340 : 300, max: Math.min(wide ? 460 : 400, app.clientWidth - (wide ? 236 : 0) - 320)});
    if (requested == null) setWidth(list.getBoundingClientRect().width);
    else resize(requested);
  }

  /** Captures a drag so crossing the mail frame does not interrupt it. */
  function start(event: PointerEvent): void {
    if (event.button !== 0) return;
    measure();
    pointer = {id: event.pointerId, x: event.clientX, width: width()};
    divider.setPointerCapture(event.pointerId);
    app.classList.add('resizing');
    event.preventDefault();
  }

  /** Moves only the boundary between the two content panes. */
  function move(event: PointerEvent): void {
    if (pointer?.id === event.pointerId) resize(pointer.width + event.clientX - pointer.x);
  }

  /** Ends a completed or cancelled drag. */
  function finish(event: PointerEvent): void {
    if (pointer?.id !== event.pointerId) return;
    pointer = null;
    app.classList.remove('resizing');
  }

  /** Provides keyboard resizing without invoking the client's mail shortcuts. */
  function onKey(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    measure();
    resize(
      event.key === 'Home'
        ? limits().min
        : event.key === 'End'
          ? limits().max
          : width() + (event.key === 'ArrowLeft' ? -10 : 10),
    );
    event.preventDefault();
    event.stopPropagation();
  }

  onMount(() => {
    app = divider.parentElement!;
    list = app.querySelector<HTMLElement>('.list-pane')!;
    measure();
    window.addEventListener('resize', measure);
  });
  onCleanup(() => {
    window.removeEventListener('resize', measure);
    app.classList.remove('resizing');
  });

  return (
    <div
      ref={divider}
      class="pane-divider"
      role="separator"
      tabindex="0"
      aria-label={t('label_resize_list')}
      aria-orientation="vertical"
      aria-valuemin={limits().min}
      aria-valuemax={limits().max}
      aria-valuenow={Math.round(width())}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
      onKeyDown={onKey}
    />
  );
}
