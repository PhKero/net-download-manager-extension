import {sendMessage} from "webext-bridge/content-script";
import {DefinedCommands} from "~/message/Commands";
import {DownloadRequestItem} from "~/interfaces/DownloadRequestItem";
import type {VideoInfo} from "~/backend/VideoInfoApi";
import type {DownloadableMedia} from "~/media/MediaOnTab";
import {addDownloads} from "~/contentscripts/AddDownloads";

/**
 * "Download this video" bar shown over the main video player of any page.
 * The page link is sent to the app, which resolves the real streams with yt-dlp.
 */

// keep in sync with YtDlpDownloaderInUi.VIDEO_SITES in the app
const VIDEO_SITES = [
    "youtube.com", "youtu.be", "youtube-nocookie.com",
    "facebook.com", "fb.watch", "instagram.com", "tiktok.com",
    "twitter.com", "x.com", "vimeo.com", "dailymotion.com", "dai.ly",
    "twitch.tv", "reddit.com", "soundcloud.com", "bilibili.com",
    "rumble.com", "odysee.com", "streamable.com", "linkedin.com", "pinterest.com",
]

const QUALITIES: Array<[string, string]> = [
    ["best", "Best quality"],
    ["h2160", "2160p (4K)"],
    ["h1440", "1440p"],
    ["h1080", "1080p"],
    ["h720", "720p"],
    ["h480", "480p"],
    ["h360", "360p"],
    ["audio", "Audio only (m4a)"],
]

const MIN_WIDTH = 240
const MIN_HEIGHT = 135

let bar: HTMLDivElement | null = null
let menu: HTMLDivElement | null = null
let dismissedFor: string | null = null
let currentVideo: HTMLVideoElement | null = null
// streams the extension caught from this tab's network traffic (m3u8 / mp4 requests)
let detectedMedia: DownloadableMedia[] = []

/** replaces the old separate "Download with ..." pop-up: its list now lives in this bar's menu */
export function setDetectedMedia(items: DownloadableMedia[]) {
    detectedMedia = items ?? []
}

function downloadDetected(media: DownloadableMedia) {
    addDownloads([{
        link: media.uri,
        suggestedName: media.suggestedFullName ?? "",
        type: media.type,
        downloadPage: location.href,
        headers: media.requestHeaders ?? null,
        description: null,
    }])
}

function isVideoSite(): boolean {
    const host = location.hostname.toLowerCase().replace(/^www\./, "")
    return VIDEO_SITES.some(site => host === site || host.endsWith("." + site))
}

/** a clean link for the current video, without playlist parameters that would make yt-dlp fetch a whole list */
function currentVideoLink(): string {
    const url = new URL(location.href)
    const host = url.hostname.replace(/^www\./, "")
    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
        const id = url.pathname === "/watch"
            ? url.searchParams.get("v")
            : url.pathname.match(/^\/embed\/([\w-]{6,})/)?.[1]
        if (id) return `https://www.youtube.com/watch?v=${id}`
    }
    return url.toString()
}

function findMainVideo(): HTMLVideoElement | null {
    let best: HTMLVideoElement | null = null
    let bestArea = 0
    for (const video of Array.from(document.querySelectorAll("video"))) {
        const r = video.getBoundingClientRect()
        const visible = r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth
        if (!visible || r.width < MIN_WIDTH || r.height < MIN_HEIGHT) continue
        const area = r.width * r.height
        if (area > bestArea) {
            best = video
            bestArea = area
        }
    }
    return best
}

const styles = `
  .abdm-vbar {
    position: fixed; z-index: 2147483646; display: flex; align-items: stretch;
    font: 12px "Segoe UI", Roboto, Helvetica, Arial, sans-serif; direction: ltr;
    border-radius: 6px; overflow: hidden; user-select: none;
    background: linear-gradient(#f4f8ff, #c9dcf7); border: 1px solid #6f8fbf;
    box-shadow: 0 1px 4px rgba(0,0,0,.35); opacity: .92; transition: opacity .15s;
  }
  .abdm-vbar:hover { opacity: 1; }
  .abdm-vbar * { box-sizing: border-box; }
  .abdm-vbar button {
    all: unset; cursor: pointer; display: flex; align-items: center; gap: 6px;
    padding: 4px 9px; color: #1d3557; font-weight: 600;
  }
  .abdm-vbar button:hover { background: rgba(255,255,255,.6); }
  .abdm-vbar .abdm-sep { width: 1px; background: #8fa9cf; }
  .abdm-vbar .abdm-small { padding: 4px 7px; font-weight: 400; }
  .abdm-vbar svg { width: 14px; height: 14px; flex-shrink: 0; }
  .abdm-vmenu {
    position: fixed; z-index: 2147483647; min-width: 170px; padding: 4px 0;
    font: 12px "Segoe UI", Roboto, Helvetica, Arial, sans-serif; direction: ltr;
    background: #fff; color: #1d3557; border: 1px solid #6f8fbf; border-radius: 6px;
    box-shadow: 0 4px 14px rgba(0,0,0,.3);
  }
  .abdm-vmenu .abdm-vmenu-item { padding: 6px 14px; cursor: pointer; display: flex; justify-content: space-between; gap: 18px; }
  .abdm-vmenu .abdm-vmenu-item:hover { background: #dbe8fb; }
  .abdm-vmenu .abdm-vmenu-size { opacity: .6; }
  .abdm-vmenu .abdm-vmenu-title { padding: 6px 14px 2px; opacity: .6; font-size: 11px; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`

const downloadIcon = `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="11" fill="#2a9d3a"/><path d="M12 6v8m0 0-3.5-3.5M12 14l3.5-3.5M7 17.5h10" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
const arrowIcon = `<svg viewBox="0 0 24 24" fill="none"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
const closeIcon = `<svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>`

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, html?: string) {
    const e = document.createElement(tag)
    if (className) e.className = className
    if (html) e.innerHTML = html
    return e
}

function ensureStyles() {
    if (document.getElementById("abdm-vbar-style")) return
    const style = el("style")
    style.id = "abdm-vbar-style"
    style.textContent = styles
    ;(document.head ?? document.documentElement).appendChild(style)
}

/**
 * A plain file (`<video src="...mp4">`) is downloaded directly, which is faster.
 * Anything else (streams, blob: players, known video sites) goes through yt-dlp with the page link.
 */
function directFileOf(video: HTMLVideoElement | null): string | null {
    if (!video || isVideoSite()) return null
    const src = video.currentSrc || video.src
    if (!/^https?:/i.test(src)) return null
    // manifests need yt-dlp / the HLS downloader, not a plain http download
    if (/\.(m3u8|mpd)(\?|#|$)/i.test(src)) return null
    return src
}

function fileNameFromTitle(src: string): string | null {
    const ext = new URL(src).pathname.match(/\.(\w{2,4})$/)?.[1] ?? "mp4"
    const title = document.title.replace(/[\\/:*?"<>|]+/g, " ").trim()
    return title ? `${title}.${ext}` : null
}

async function sendToApp(quality: string | null) {
    const direct = quality === null ? directFileOf(currentVideo) : null
    const item: DownloadRequestItem = direct ? {
        link: direct,
        downloadPage: location.href,
        headers: null,
        description: null,
        suggestedName: fileNameFromTitle(direct),
        type: "http",
    } : {
        link: currentVideoLink(),
        downloadPage: location.href,
        // yt-dlp makes its own requests, page headers would only confuse it
        headers: null,
        description: null,
        suggestedName: null,
        type: "ytdlp",
        quality,
    }
    await sendMessage(DefinedCommands.ADD_DOWNLOAD, [item], "background")
}

// collections on other sites (keep in sync with YtDlpPlaylistExpander in the app)
const OTHER_PLAYLIST_PATTERNS: Array<[string, RegExp]> = [
    ["soundcloud.com", /^\/[^/]+\/(sets\/[^/]+|tracks|albums|popular-tracks|likes|reposts)\/?$/],
    ["vimeo.com", /^\/(showcase|album|channels|groups)\/[^/]+(\/videos)?\/?$/],
    ["dailymotion.com", /^\/playlist\/[^/]+\/?$/],
    ["tiktok.com", /^\/@[^/]+\/?$/],
    ["bilibili.com", /^\/(medialist|list|festival)\/.+/],
    ["bandcamp.com", /^\/(album\/[^/]+|music)\/?$/],
    ["twitch.tv", /^\/[^/]+\/(videos|clips)\/?$/],
    ["instagram.com", /^\/[^/]+\/(reels|tagged)\/?$/],
]
const YOUTUBE_CHANNEL = /^\/(@[^/]+|c\/[^/]+|channel\/[^/]+|user\/[^/]+)(\/(videos|shorts|streams|playlists))?\/?$/

// audio sites have no <video> element, so their pages get a fixed bar instead
const AUDIO_ITEM_PATTERNS: Array<[string, RegExp]> = [
    ["soundcloud.com", /^\/[^/]+\/[^/]+\/?$/],
    ["bandcamp.com", /^\/track\/[^/]+\/?$/],
    ["mixcloud.com", /^\/[^/]+\/[^/]+\/?$/],
]

function hostIs(host: string, site: string) {
    return host === site || host.endsWith("." + site)
}

function currentHost() {
    return location.hostname.toLowerCase().replace(/^(www|m)\./, "")
}

/** the playlist / channel / album the current page belongs to, if any */
function currentPlaylistLink(): string | null {
    const url = new URL(location.href)
    const host = currentHost()
    if (hostIs(host, "youtube.com")) {
        const list = url.searchParams.get("list")
        // "RD..." are endless auto-generated mixes
        if (list && !list.startsWith("RD")) return `https://www.youtube.com/playlist?list=${list}`
        if (YOUTUBE_CHANNEL.test(url.pathname)) return `https://www.youtube.com${url.pathname}`
        return null
    }
    const match = OTHER_PLAYLIST_PATTERNS.some(([site, re]) => hostIs(host, site) && re.test(url.pathname))
    return match ? `${url.origin}${url.pathname}` : null
}

/** pages that are only a list (no single video playing), the bar offers just the playlist */
function isPlaylistPage(): boolean {
    if (currentPlaylistLink() === null) return false
    const path = new URL(location.href).pathname
    return !(hostIs(currentHost(), "youtube.com") && (path === "/watch" || path.startsWith("/shorts/")))
}

function isAudioItemPage(): boolean {
    const host = currentHost()
    const path = new URL(location.href).pathname
    return !isPlaylistPage() && AUDIO_ITEM_PATTERNS.some(([site, re]) => hostIs(host, site) && re.test(path))
}

async function sendPlaylistToApp(quality: string | null, link: string | null = currentPlaylistLink()) {
    if (!link) return
    const item: DownloadRequestItem = {
        link,
        downloadPage: location.href,
        headers: null,
        description: null,
        suggestedName: null,
        type: "ytdlp",
        quality,
        playlist: true,
    }
    await sendMessage(DefinedCommands.ADD_DOWNLOAD, [item], "background")
}

// what the app found on a page; kept for the page's lifetime, the app caches too
const infoCache = new Map<string, Promise<VideoInfo>>()

function videoInfoOf(link: string): Promise<VideoInfo> {
    let pending = infoCache.get(link)
    if (!pending) {
        pending = sendMessage(DefinedCommands.VIDEO_INFO, {link, downloadPage: location.href}, "background")
            .then(info => {
                // failures should be retried next time
                if (info.type === "error") infoCache.delete(link)
                return info
            })
            .catch(() => {
                infoCache.delete(link)
                return {type: "error", error: "extension error"} as VideoInfo
            })
        infoCache.set(link, pending)
    }
    return pending
}

/** start asking early (when the mouse reaches the bar) so the menu is usually ready when opened */
function prefetchInfo() {
    if (directFileOf(currentVideo) || isPlaylistPage()) return
    videoInfoOf(currentVideoLink())
}

function formatSize(bytes: number | null | undefined): string {
    if (!bytes || bytes <= 0) return ""
    const units = ["B", "KB", "MB", "GB", "TB"]
    let value = bytes
    let unit = 0
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024
        unit++
    }
    return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`
}

function closeMenu() {
    menu?.remove()
    menu = null
}

function addMenuSection(
    title: string,
    qualities: Array<[string, string, string?]>,
    onPick: (quality: string) => void,
    target: HTMLElement | null = menu,
) {
    if (!target) return
    // titles come from the site, so never as html
    target.appendChild(el("div", "abdm-vmenu-title")).textContent = title
    for (const [token, label, size] of qualities) {
        const item = el("div", "abdm-vmenu-item")
        item.appendChild(el("span", undefined)).textContent = label
        if (size) item.appendChild(el("span", "abdm-vmenu-size")).textContent = size
        item.addEventListener("click", (e) => {
            e.stopPropagation()
            closeMenu()
            onPick(token)
        })
        target.appendChild(item)
    }
}

function positionMenu(anchor: HTMLElement) {
    if (!menu) return
    const r = anchor.getBoundingClientRect()
    const left = Math.min(r.right - menu.offsetWidth, innerWidth - menu.offsetWidth - 4)
    menu.style.left = `${Math.max(left, 4)}px`
    menu.style.top = `${r.bottom + 2}px`
}

const PLAYLIST_QUALITIES = QUALITIES.filter(([q]) => ["best", "h1080", "h720", "h480", "audio"].includes(q))

function openMenu(anchor: HTMLElement) {
    closeMenu()
    const thisMenu = el("div", "abdm-vmenu")
    menu = thisMenu
    const knownPlaylist = currentPlaylistLink()
    const showVideo = !isPlaylistPage()
    // the video part is filled when the app answers; known playlists are offered right away
    const videoPart = el("div")
    thisMenu.appendChild(videoPart)
    if (knownPlaylist) {
        addMenuSection(isPlaylistPage() ? "All videos on this page" : "Entire playlist", PLAYLIST_QUALITIES, q => sendPlaylistToApp(q))
    }
    if (detectedMedia.length) {
        const rows = detectedMedia.map((m, i) => {
            const details = [m.resolution, m.size, m.duration, m.extension].filter(Boolean).join(" · ")
            return [String(i), (m.displayName ?? "Stream").slice(0, 50), details] as [string, string, string]
        })
        addMenuSection("Detected streams", rows, i => downloadDetected(detectedMedia[Number(i)]))
    }
    document.documentElement.appendChild(thisMenu)
    positionMenu(anchor)
    if (!showVideo) return
    const direct = directFileOf(currentVideo)
    if (direct) {
        addMenuSection("This video", [["direct", "Download the file", ""]], () => sendToApp(null), videoPart)
        return
    }
    videoPart.appendChild(el("div", "abdm-vmenu-title", "Reading available qualities..."))
    positionMenu(anchor)
    const link = currentVideoLink()
    videoInfoOf(link).then(info => {
        if (menu !== thisMenu) return
        videoPart.innerHTML = ""
        if (info.type === "video" && info.qualities?.length) {
            addMenuSection(
                info.title ? `This video — ${info.title.slice(0, 60)}` : "This video",
                info.qualities.map(q => [q.quality, q.label, formatSize(q.size)] as [string, string, string]),
                sendToApp,
                videoPart,
            )
        } else if (info.type === "playlist") {
            // a list on a site we don't know the url pattern of
            addMenuSection(
                `All ${info.count ?? ""} videos on this page`,
                PLAYLIST_QUALITIES,
                q => sendPlaylistToApp(q, link),
                videoPart,
            )
        } else {
            // the app couldn't read it; offer the fixed list, the add dialog will show the reason
            addMenuSection("This video", QUALITIES, sendToApp, videoPart)
            if (info.error) videoPart.appendChild(el("div", "abdm-vmenu-title")).textContent = info.error.slice(0, 80)
        }
        positionMenu(anchor)
    })
}

type BarMode = "video" | "video+playlist" | "playlist" | "audio"
let barMode: BarMode | null = null

function createBar(mode: BarMode): HTMLDivElement {
    ensureStyles()
    const b = el("div", "abdm-vbar")
    const parts: HTMLElement[] = []
    const sep = () => el("span", "abdm-sep")
    if (mode !== "playlist") {
        const label = mode === "audio" ? "Download this audio" : "Download this video"
        const main = el("button", undefined, `${downloadIcon}<span>${label}</span>`)
        main.title = "Download with Net Download Manager"
        main.addEventListener("click", (e) => {
            e.stopPropagation()
            closeMenu()
            sendToApp(mode === "audio" ? "audio" : null)
        })
        parts.push(main)
    }
    if (mode === "playlist" || mode === "video+playlist") {
        const playlist = el("button", mode === "playlist" ? undefined : "abdm-small",
            mode === "playlist" ? `${downloadIcon}<span>Download playlist</span>` : "Playlist")
        playlist.title = "Add every video of this playlist"
        playlist.addEventListener("click", (e) => {
            e.stopPropagation()
            closeMenu()
            sendPlaylistToApp(null)
        })
        if (parts.length) parts.push(sep())
        parts.push(playlist)
    }
    const more = el("button", "abdm-small", arrowIcon)
    more.title = "Choose quality"
    more.addEventListener("click", (e) => {
        e.stopPropagation()
        if (menu) {
            closeMenu()
        } else {
            openMenu(more)
        }
    })
    const close = el("button", "abdm-small", closeIcon)
    close.title = "Hide for this page"
    close.addEventListener("click", (e) => {
        e.stopPropagation()
        dismissedFor = location.href
        hideBar()
    })
    b.addEventListener("mouseenter", () => prefetchInfo())
    // the player must not receive these clicks (it would pause / go fullscreen)
    for (const type of ["mousedown", "mouseup", "dblclick", "pointerdown"]) {
        b.addEventListener(type, e => e.stopPropagation())
    }
    b.append(...parts, sep(), more, sep(), close)
    document.documentElement.appendChild(b)
    return b
}

function hideBar() {
    closeMenu()
    bar?.remove()
    bar = null
    barMode = null
    currentVideo = null
}

function ensureBar(mode: BarMode): HTMLDivElement {
    if (bar && barMode !== mode) hideBar()
    if (!bar) {
        bar = createBar(mode)
        barMode = mode
    }
    return bar
}

function placeBar(video: HTMLVideoElement, mode: BarMode) {
    const b = ensureBar(mode)
    const r = video.getBoundingClientRect()
    const top = Math.max(r.top + 8, 4)
    const left = Math.min(r.right - b.offsetWidth - 8, innerWidth - b.offsetWidth - 4)
    b.style.top = `${top}px`
    b.style.left = `${Math.max(left, 4)}px`
}

/** playlist pages have no player, so the bar sits in the top right corner of the window */
function placeFixedBar(mode: BarMode) {
    const b = ensureBar(mode)
    b.style.top = "72px"
    b.style.left = `${Math.max(innerWidth - b.offsetWidth - 24, 4)}px`
}

function update() {
    if (dismissedFor !== null && dismissedFor !== location.href) {
        // a new video was opened (sites like youtube change the url without reloading)
        dismissedFor = null
    }
    if (dismissedFor !== null || document.fullscreenElement) {
        hideBar()
        return
    }
    if (isPlaylistPage()) {
        placeFixedBar("playlist")
        return
    }
    if (isAudioItemPage() && !findMainVideo()) {
        placeFixedBar("audio")
        return
    }
    const video = findMainVideo()
    if (!video) {
        hideBar()
        return
    }
    currentVideo = video
    placeBar(video, currentPlaylistLink() ? "video+playlist" : "video")
}

/** shown on every site like IDM; known video sites only decide how the link is sent */
export function boot() {
    // embedded players get their own bar inside their frame; findMainVideo ignores small frames anyway
    document.addEventListener("click", () => closeMenu())
    addEventListener("scroll", () => update(), {passive: true})
    addEventListener("resize", () => update())
    document.addEventListener("fullscreenchange", () => update())
    // players appear / move without events we can hook, so also poll a little
    setInterval(update, 700)
    update()
}
