/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * A sanitized email body in a sandboxed, script-free frame that grows to its content.
 *
 * `allow-same-origin` lets the page measure the frame; without
 * `allow-scripts` nothing inside can run. Links open in a new tab through
 * `allow-popups`.
 *
 * @module client/components/MailFrame
 */
import {createEffect, createMemo, onCleanup} from 'solid-js';
import {frameDocument, sanitizeEmail, textToHTML} from '../../shared/sanitize';
import {t} from '../../shared/i18n';

/** Frame properties. */
export interface MailFrameProps {
  html: string;
  text: string;
  allowRemote: boolean;
  dark: boolean;
  /** Receives the number of blocked remote images and trackers. */
  onBlocked?: (blocked: number, trackers: number) => void;
}

/** Renders one message body. */
export function MailFrame(props: MailFrameProps) {
  // Prop getters may depend on the entire public state; unchanged inputs must not reload the document.
  const html = createMemo(() => props.html);
  const text = createMemo(() => props.text);
  const dark = createMemo(() => props.dark);
  const allowRemote = createMemo(() => props.allowRemote);
  let frame!: HTMLIFrameElement;
  let observer: ResizeObserver | undefined;
  let animation: number | undefined;
  let view: (Window & typeof globalThis) | null = null;
  let disposed = false;

  /** Fits the frame height to its document; skips an unchanged height. */
  const fit = () => {
    animation = undefined;
    const body = frame.contentDocument?.body;
    if (disposed || !body || !frame.isConnected) return;
    const height = `${Math.ceil(Math.max(body.scrollHeight, body.getBoundingClientRect().height))}px`;
    if (frame.style.height === height) return;
    observer?.disconnect();
    frame.style.height = height;
    if (view) {
      const observed = observer;
      animation = view.requestAnimationFrame(() => {
        animation = undefined;
        if (observer === observed && frame.contentDocument?.body === body) observed?.observe(body);
      });
    }
  };

  /** Schedules one fit in the observed document's next frame, outside its resize-delivery cycle. */
  const scheduleFit = () => {
    if (!disposed && animation === undefined && view) animation = view.requestAnimationFrame(fit);
  };

  /** Cancels work owned by the previous frame document. */
  const disconnect = () => {
    observer?.disconnect();
    if (animation !== undefined) view?.cancelAnimationFrame(animation);
    animation = undefined;
  };

  createEffect(() => {
    const plain = !html().trim();
    const body = plain
      ? {html: textToHTML(text()), blocked: 0, trackers: 0}
      : sanitizeEmail(html(), allowRemote(), dark());
    props.onBlocked?.(body.blocked, body.trackers);
    frame.srcdoc = frameDocument(body.html, {allowRemote: allowRemote(), dark: dark(), plain});
  });

  const onLoad = () => {
    if (disposed || !frame.isConnected) return;
    disconnect();
    view = frame.contentDocument?.defaultView || null;
    const body = frame.contentDocument?.body;
    if (body && view) {
      observer = new view.ResizeObserver(scheduleFit);
      observer.observe(body);
      scheduleFit();
    }
  };
  onCleanup(() => {
    disposed = true;
    disconnect();
    view = null;
  });

  return (
    <iframe
      ref={frame}
      class="mail-frame"
      title={t('label_message_text')}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerpolicy="no-referrer"
      onLoad={onLoad}
    />
  );
}
