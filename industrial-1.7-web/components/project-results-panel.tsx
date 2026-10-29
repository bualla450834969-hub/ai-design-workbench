"use client";

import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { Download, FolderOpen, Images, Search, Star, X } from "lucide-react";
import { projectResultDisplayEntries, resultPixelLabels, resultThumbnailUrl, type ProjectResultDisplayEntry } from "@/lib/project-results";
import { browserDownloadMessage, chooseBrowserDownloadDirectory, downloadProjectAsset, forgetBrowserDownloadDirectory, restoreBrowserDownloadDirectory, savePreparedBrowserDownload, supportsBrowserDownloadDirectory, type BrowserDownloadDirectory, type BrowserDownloadResult } from "@/lib/browser-downloads";
import type { Asset, GenerationResult } from "@/types/domain";
import { isBrowserLocalMode } from "@/lib/browser-local-mode";
import styles from "./project-results-panel.module.css";

export interface ProjectResultSelection {
  reuse?: (asset: Asset, generation: GenerationResult) => void;
  download?: (asset: Asset, displayName?: string) => void;
}

export const ProjectResultsContext = createContext<ProjectResultSelection | null>(null);
export function useProjectResultSelection() { return useContext(ProjectResultsContext); }

type AssetMetadataPatch = { favorite?: boolean; note?: string };
export interface ProjectResultsPanelProps {
  projectId?: string;
  assets: Asset[];
  onPreview: (asset: Asset) => void;
  onPatch: (asset: Asset, patch: AssetMetadataPatch) => Promise<void>;
  onSixView: (asset: Asset) => void;
  onRestore?: (asset: Asset) => void;
  onReuse?: (asset: Asset) => void;
  onExport?: (ids?: string[], favoritesOnly?: boolean) => Promise<BrowserDownloadResult | void>;
  onOpenResultsDirectory?: () => void;
  downloadUserId?: string;
  restoringIds?: string[];
  open: boolean;
  favoritesOnly: boolean;
  onClose: () => void;
  onFavoritesOnlyChange?: (value: boolean) => void;
}

function createdLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "生成时间未记录" : date.toLocaleString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

export { projectResultDisplayEntries, type ProjectResultDisplayEntry } from "@/lib/project-results";

export function projectResultMatchesSearch(entry: ProjectResultDisplayEntry, query: string) {
  const search = query.trim().toLocaleLowerCase();
  if (!search) return true;
  const { asset, displayName } = entry;
  return `${displayName} ${asset.name} ${asset.note || ""} ${createdLabel(asset.createdAt)}`.toLocaleLowerCase().includes(search);
}

function ResultCard({ asset, displayName, busy, onPreview, onPatch, onSixView, onRestore, onReuse, restoring, selected, onSelect, onDownload, downloading, web }: {
  asset: Asset;
  displayName: string;
  busy: boolean;
  onPreview: () => void;
  onPatch: (patch: AssetMetadataPatch) => Promise<void>;
  onSixView: () => void;
  onRestore?: () => void;
  onReuse?: () => void;
  restoring: boolean;
  selected: boolean;
  onSelect: () => void;
  onDownload: () => void;
  downloading: boolean;
  web: boolean;
}) {
  const [note, setNote] = useState(asset.note || "");
  const [imageUnavailable, setImageUnavailable] = useState(false);
  useEffect(() => setNote(asset.note || ""), [asset.note]);
  useEffect(() => setImageUnavailable(false), [asset.url]);
  const dimensions = resultPixelLabels(asset);
  const saveNote = async () => {
    if (note === (asset.note || "") || busy) return;
    await onPatch({ note });
  };
  return <article className={`${styles.card} ${selected ? styles.selectedCard : ""}`}>
    <button className={styles.preview} type="button" onClick={onPreview} aria-label={`放大预览 ${displayName}`}>
      {imageUnavailable ? <span className={styles.unavailableImage}>图片暂时无法预览{asset.localSaveError ? "，请尝试重新保存" : ""}</span> : <img loading="lazy" src={resultThumbnailUrl(asset.url)} alt={displayName} onError={() => setImageUnavailable(true)} />}
    </button>
    <div className={styles.cardDetails}>
      <div className={styles.nameRow}><label className={styles.selection}><input type="checkbox" checked={selected} onChange={onSelect} aria-label={`选择 ${displayName}`} /><strong title={displayName}>{displayName}</strong></label><button className={`${styles.favorite} ${asset.favorite ? styles.favoriteActive : ""}`} type="button" onClick={() => void onPatch({ favorite: !asset.favorite })} disabled={busy} aria-pressed={Boolean(asset.favorite)} aria-label={asset.favorite ? `取消收藏 ${displayName}` : `收藏 ${displayName}`}><Star size={16} fill={asset.favorite ? "currentColor" : "none"} /></button></div>
      <time dateTime={asset.createdAt}>{createdLabel(asset.createdAt)}</time>
      <div className={styles.pixelLabels}><span>{dimensions.native}</span><span className={asset.upscaled ? styles.upscaled : ""}>{web && asset.localSaveError ? isBrowserLocalMode() ? "尚未保存到本机浏览器" : "尚未保存到服务器项目" : dimensions.exported}</span></div>
      {asset.localSaveError && <div className={styles.saveWarning} title={asset.localSaveError}>{web ? isBrowserLocalMode() ? "尚未保存到本机浏览器" : "尚未保存到服务器项目" : "尚未保存本机"} {onRestore && <button type="button" disabled={restoring} onClick={onRestore}>{restoring ? "保存中…" : "重新保存"}</button>}</div>}
      <label className={styles.noteLabel}>方案备注<input value={note} placeholder="记录差异、亮点或待调整处" maxLength={240} disabled={busy} onChange={(event) => setNote(event.target.value)} onBlur={() => void saveNote()} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} /></label>
      <div className={styles.cardActions}><button type="button" onClick={onDownload} disabled={downloading || Boolean(asset.localSaveError)} title={asset.localSaveError ? "请先重新保存已有图片，再下载" : "下载这张图片到设备"}><Download size={14} />{downloading ? "下载中…" : "下载图片"}</button><button type="button" onClick={onSixView}>生成六视图</button>{onReuse && <button type="button" onClick={onReuse}>沿用参数</button>}</div>
    </div>
  </article>;
}

export function ProjectResultsPanel({ projectId, assets, onPreview, onPatch, onSixView, onRestore, onReuse, onExport, onOpenResultsDirectory, downloadUserId, restoringIds = [], open, favoritesOnly, onClose, onFavoritesOnlyChange }: ProjectResultsPanelProps) {
  const [pageSize, setPageSize] = useState(24);
  const [exporting, setExporting] = useState(false);
  const [query, setQuery] = useState("");
  const [localFavoritesOnly, setLocalFavoritesOnly] = useState(favoritesOnly);
  const [error, setError] = useState("");
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [downloadingIds, setDownloadingIds] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [preparedDownload, setPreparedDownload] = useState<Extract<BrowserDownloadResult, { mode: "prepared" }> | null>(null);
  const [directory, setDirectory] = useState<BrowserDownloadDirectory | null>(null);
  const [canChooseDirectory, setCanChooseDirectory] = useState(false);
  const [choosingDirectory, setChoosingDirectory] = useState(false);
  const pendingDownloads = useRef(new Set<string>());
  const pendingIds = useRef(new Set<string>());
  const pendingExport = useRef(false);
  const exportEpoch = useRef(0);
  const dialogRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const projectKey = projectId ?? assets[0]?.projectId ?? "";
  const local = isBrowserLocalMode();
  const resultEntries = useMemo(() => projectResultDisplayEntries(assets), [assets]);
  const onlyFavorites = onFavoritesOnlyChange ? favoritesOnly : localFavoritesOnly;
  const favoriteCount = resultEntries.filter(({ asset }) => asset.favorite).length;
  const search = query.trim().toLocaleLowerCase();
  const entries = resultEntries.filter((entry) => (!onlyFavorites || entry.asset.favorite) && projectResultMatchesSearch(entry, search));
  const selected = selectedIds.filter((id) => resultEntries.some((entry) => entry.asset.id === id));
  const hiddenSelectedCount = selected.filter((id) => !entries.some((entry) => entry.asset.id === id)).length;
  useEffect(() => setPageSize(24), [query, onlyFavorites, open]);
  const exportAction = async (action: () => Promise<BrowserDownloadResult | void>) => {
    if (pendingExport.current || !open) return;
    const epoch = exportEpoch.current; pendingExport.current = true;
    setExporting(true); setPreparedDownload(null); setError(""); setNotice("");
    try {
      const result = await action();
      if (epoch !== exportEpoch.current) return;
      if (result?.mode === "prepared") { setPreparedDownload(result); setNotice("图片包已准备好，尚未下载。请点击“下载已准备图片包”。"); }
      else setNotice(result ? browserDownloadMessage(result) : "已发起导出，请查看浏览器下载列表或已选择的下载文件夹。");
    } catch (cause) { if (epoch === exportEpoch.current) setError(cause instanceof Error ? cause.message : "导出失败"); }
    finally { if (epoch === exportEpoch.current) { pendingExport.current = false; setExporting(false); } }
  };
  const downloadPrepared = () => {
    if (!preparedDownload) return;
    setError("");
    // Keep the actual download inside this fresh click's user activation.
    try { setNotice(browserDownloadMessage(savePreparedBrowserDownload(preparedDownload))); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "下载未能发起，请再次点击下载。"); }
  };
  useEffect(() => {
    exportEpoch.current += 1; pendingExport.current = false;
    setPreparedDownload(null); setExporting(false); setNotice(""); setError("");
    return () => { exportEpoch.current += 1; pendingExport.current = false; };
  }, [open, projectKey, downloadUserId]);
  useEffect(() => setLocalFavoritesOnly(favoritesOnly), [favoritesOnly]);
  useEffect(() => { if (open) setError(""); }, [open]);
  useEffect(() => {
    let cancelled = false; setDirectory(null);
    setCanChooseDirectory(Boolean(downloadUserId && supportsBrowserDownloadDirectory()));
    if (downloadUserId && open) void restoreBrowserDownloadDirectory(downloadUserId).then((value) => { if (!cancelled) setDirectory(value); }).catch(() => {});
    return () => { cancelled = true; };
  }, [downloadUserId, open]);
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => { if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [open]);

  const patchAsset = async (asset: Asset, patch: AssetMetadataPatch) => {
    if (pendingIds.current.has(asset.id)) return;
    pendingIds.current.add(asset.id);
    setBusyIds([...pendingIds.current]);
    try { await onPatch(asset, patch); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "方案信息保存失败，请重试。"); }
    finally { pendingIds.current.delete(asset.id); setBusyIds([...pendingIds.current]); }
  };
  const download = async (asset: Asset, displayName: string) => {
    if (pendingDownloads.current.has(asset.id)) return;
    pendingDownloads.current.add(asset.id); setDownloadingIds([...pendingDownloads.current]); setError(""); setNotice("");
    try { setNotice(browserDownloadMessage(await downloadProjectAsset(asset, downloadUserId, displayName))); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "图片下载失败，请重试。"); }
    finally { pendingDownloads.current.delete(asset.id); setDownloadingIds([...pendingDownloads.current]); }
  };
  const chooseDirectory = async () => {
    if (!downloadUserId || choosingDirectory) return;
    setChoosingDirectory(true); setError("");
    try { setDirectory(await chooseBrowserDownloadDirectory(downloadUserId)); }
    catch (cause) { if (!(cause instanceof DOMException && cause.name === "AbortError")) setError(cause instanceof Error ? cause.message : "选择下载文件夹失败。"); }
    finally { setChoosingDirectory(false); }
  };
  const select = (id: string) => {
    if (!selected.includes(id) && selected.length >= 500) { setError("每次最多选择 500 张，请分批导出。"); return; }
    setSelectedIds(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  };
  const cards = (items: ProjectResultDisplayEntry[]) => items.map(({ asset, displayName }) => <ResultCard key={asset.id} asset={asset} displayName={displayName} busy={busyIds.includes(asset.id)} onPreview={() => { onClose(); onPreview(asset); }} onPatch={(patch) => patchAsset(asset, patch)} onSixView={() => { onClose(); onSixView(asset); }} onReuse={onReuse ? () => onReuse(asset) : undefined} onRestore={onRestore ? () => onRestore(asset) : undefined} restoring={restoringIds.includes(asset.id)} selected={selected.includes(asset.id)} onSelect={() => select(asset.id)} onDownload={() => void download(asset, displayName)} downloading={downloadingIds.includes(asset.id)} web={Boolean(downloadUserId)} />);

  if (!open) return null;
  return <div className={styles.layer}>
    <button className={styles.backdrop} type="button" aria-label="关闭项目方案面板" onClick={onClose} />
    <section ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (event.key === "Tab") {
        const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]')).filter((element) => element.getClientRects().length > 0);
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <header className={styles.header}>
        <div><h2 id={titleId}>{onlyFavorites ? "项目收藏" : "项目全部方案"}</h2><p>{`本项目 ${resultEntries.length} 张生成方案，收藏和备注会保留。`}</p></div>
        <div className={styles.headerActions}>{onOpenResultsDirectory && <button type="button" onClick={onOpenResultsDirectory}><FolderOpen size={15} /><span>打开成果文件夹</span></button>}<button className={styles.close} type="button" onClick={onClose} aria-label="关闭"><X size={20} /></button></div>
      </header>
      <div className={styles.toolbar}>
        <div className={styles.tabs}><button className={!onlyFavorites ? styles.activeTab : ""} type="button" aria-pressed={!onlyFavorites} onClick={() => { setLocalFavoritesOnly(false); onFavoritesOnlyChange?.(false); }}><Images size={14} />全部方案</button><button className={onlyFavorites ? styles.activeTab : ""} type="button" aria-pressed={onlyFavorites} onClick={() => { setLocalFavoritesOnly(true); onFavoritesOnlyChange?.(true); }}><Star size={14} />收藏 ({favoriteCount})</button></div>
        <label className={styles.search}><Search size={15} /><input value={query} placeholder="搜索方案名、备注或生成日期" aria-label="搜索项目方案" onChange={(event) => setQuery(event.target.value)} /></label>
      </div>
      {downloadUserId && <div className={styles.downloadLocation}>
        {canChooseDirectory && <><button type="button" disabled={choosingDirectory} onClick={() => void chooseDirectory()}><FolderOpen size={15} />{choosingDirectory ? "选择中…" : "选择下载文件夹"}</button>{directory && <button type="button" onClick={() => { void forgetBrowserDownloadDirectory(downloadUserId).then(() => setDirectory(null)); }}>使用系统下载</button>}</>}
        <span>{directory ? `下载文件夹：${directory.name}${directory.permission !== "granted" ? "（需重新选择授权）" : directory.remembered ? "（已记住，浏览器可能要求重新授权）" : "（仅本次页面有效）"}` : "下载由浏览器或系统管理；如 iPad 不支持选择固定目录，请使用“存储到文件”。"} {isBrowserLocalMode() ? "项目原件保存在当前浏览器，请定期导出备份。" : "项目原件仍保存在服务器。"}</span>
      </div>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      {preparedDownload && <div className={styles.downloadLocation}><button type="button" onClick={downloadPrepared}><Download size={14} />下载已准备图片包</button><span>{preparedDownload.filename} · 仅含图片；请在浏览器下载列表中确认保存。</span></div>}
      {onExport && <div className={`${styles.toolbar} ${styles.exportTools}`}>
        <button type="button" disabled={exporting || resultEntries.length === 0 || resultEntries.length > 500} onClick={() => void exportAction(() => onExport())}><Download size={14} />导出全部 ZIP</button>
        <button type="button" disabled={exporting || selected.length === 0} onClick={() => void exportAction(() => onExport(selected))}>导出已选 ZIP（{selected.length}{hiddenSelectedCount ? `，筛选外 ${hiddenSelectedCount}` : ""}）</button>
        <button type="button" disabled={exporting || favoriteCount === 0 || favoriteCount > 500} onClick={() => void exportAction(() => onExport(undefined, true))}>导出收藏 ZIP</button>
        <button type="button" disabled={exporting || entries.length === 0} onClick={() => setSelectedIds(entries.slice(0, 500).map((entry) => entry.asset.id))}>仅选当前筛选{entries.length > 500 ? "前 500 张" : "全部"}</button>
        {selected.length > 0 && <button type="button" onClick={() => setSelectedIds([])}>清空选择</button>}
        <small>{exporting ? local ? "正在本机准备图片包…" : "正在导出…" : local ? "ZIP 仅包含图片，单次最多 500 张、合计 512 MiB，不能代替完整工作区备份。切换筛选保留已选；“仅选当前筛选”会替换选择。" : "ZIP 包含图片和方案参数，单次最多 500 张。切换筛选保留已选；“仅选当前筛选”会替换选择。"}</small>
      </div>}
      <div className={styles.body}>
        {entries.length ? <div className={styles.grid}>{cards(entries.slice(0, pageSize))}</div> : <div className={styles.empty}><Images size={30} /><strong>{search ? "没有匹配的方案" : onlyFavorites ? "本项目还没有收藏方案" : "本项目还没有生成方案"}</strong><p>{search ? "试试其他名称、备注或日期。" : onlyFavorites ? "点击方案卡片上的星标，即可在这里集中查看。" : "生成方案后，将自动出现在这里。"}</p></div>}
        {entries.length > pageSize && <button type="button" onClick={() => setPageSize((current) => current + 24)}>继续显示方案（{pageSize} / {entries.length}）</button>}
      </div>
      <footer className={styles.footer}><span>{entries.length} 张可见</span><span>原生尺寸指供应商返回像素，放大导出不代表原生清晰度。</span></footer>
    </section>
  </div>;
}
