/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Shared folder roles, localized labels and ordering for the mail client.
 *
 * @module shared/folders
 */
import type {FolderRole, MailFolder} from './types';
import {t} from './i18n';

/** Display order of system folders; custom folders follow in server-name order. */
export const FOLDER_ROLES: readonly FolderRole[] = ['inbox', 'sent', 'archive', 'trash', 'spam', 'drafts'];

/** Returns a localized system name or the server's custom folder name. */
export function folderName(folder: MailFolder): string {
  return folder.role ? t(`folder_${folder.role}`) : folder.name;
}

/** Includes server parent names so nested custom folders with the same leaf name remain distinguishable. */
export function folderPath(folder: MailFolder, catalog: MailFolder[]): string {
  return indexedPath(folder, new Map(catalog.map(item => [item.id, item])));
}

/** Resolves one path using indexed parents, with bounded cycle handling. */
function indexedPath(folder: MailFolder, byID: ReadonlyMap<string, MailFolder>): string {
  const names = [folderName(folder)];
  const seen = new Set([folder.id]);
  let parent = folder.parent;
  while (parent && !seen.has(parent)) {
    seen.add(parent);
    const item = byID.get(parent);
    if (!item) break;
    names.unshift(folderName(item));
    parent = item.parent;
  }
  return names.join(' / ');
}

/** Orders bounded catalogs without merging custom folders that happen to share a name. */
export function orderFolders(folders: MailFolder[]): MailFolder[] {
  const rank = (folder: MailFolder) => (folder.role ? FOLDER_ROLES.indexOf(folder.role) : FOLDER_ROLES.length);
  const byID = new Map(folders.map(folder => [folder.id, folder]));
  const paths = new Map(folders.map(folder => [folder.id, indexedPath(folder, byID)]));
  return [...folders].sort((a, b) => rank(a) - rank(b) || paths.get(a.id)!.localeCompare(paths.get(b.id)!));
}
