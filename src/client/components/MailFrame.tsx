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
import {createEffect, onCleanup} from 'solid-js';
import {frameDocument, sanitizeEmail, textToHTML} from '../../shared/sanitize';

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
  let frame!: HTMLIFrameElement;
  let observer: ResizeObserver | undefined;

  /** Fits the frame height to its document; skips an unchanged height. */
  const fit = () => {
    const doc = frame.contentDocument;
    if (!doc?.documentElement) return;
    const height = `${Math.ceil(doc.documentElement.scrollHeight)}px`;
    if (frame.style.height !== height) frame.style.height = height;
  };

  createEffect(() => {
    const plain = !props.html.trim();
    const body = plain
      ? {html: textToHTML(props.text), blocked: 0, trackers: 0}
      : sanitizeEmail(props.html, props.allowRemote);
    props.onBlocked?.(body.blocked, body.trackers);
    frame.srcdoc = frameDocument(body.html, {allowRemote: props.allowRemote, dark: props.dark, plain});
  });

  const onLoad = () => {
    fit();
    observer?.disconnect();
    const body = frame.contentDocument?.body;
    if (body) {
      // Resizing the frame inside the observer callback loops ("ResizeObserver loop completed
      // with undelivered notifications"); fit on the next frame instead.
      observer = new ResizeObserver(() => requestAnimationFrame(fit));
      observer.observe(body);
    }
  };
  onCleanup(() => observer?.disconnect());

  return (
    <iframe
      ref={frame}
      class="mail-frame"
      title="Текст письма"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerpolicy="no-referrer"
      onLoad={onLoad}
    />
  );
}
