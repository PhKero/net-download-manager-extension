import {DownloadRequestItem} from "~/interfaces/DownloadRequestItem";
import {addDownloads} from "~/contentscripts/AddDownloads";

/**
 * IDM style "Download all links": collects every link / image / media source on the page,
 * groups them by file type, and lets the user pick which groups (or extensions) to send to the app.
 */

const GROUPS: Array<[string, string[]]> = [
    ["Videos", ["mp4", "mkv", "avi", "mov", "webm", "wmv", "flv", "m4v", "3gp", "ts"]],
    ["Audio", ["mp3", "m4a", "aac", "flac", "wav", "ogg", "opus", "wma"]],
    ["Images", ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "tif", "tiff", "ico", "avif", "heic"]],
    ["Documents", ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "epub", "rtf", "odt"]],
    ["Archives", ["zip", "rar", "7z", "gz", "tgz", "bz2", "xz", "tar", "iso"]],
    ["Programs", ["exe", "msi", "msix", "apk", "xapk", "dmg", "deb", "rpm", "appimage", "jar"]],
]

interface FoundLink {
    url: string
    ext: string
    group: string
    text: string | null
}

let panel: HTMLDivElement | null = null

function extensionOf(url: string): string {
    try {
        const path = new URL(url).pathname
        const name = path.substring(path.lastIndexOf("/") + 1)
        const dot = name.lastIndexOf(".")
        return dot > 0 ? name.substring(dot + 1).toLowerCase() : ""
    } catch {
        return ""
    }
}

function groupOf(ext: string): string | null {
    for (const [name, exts] of GROUPS) {
        if (exts.includes(ext)) return name
    }
    return null
}

function collectLinksFrom(doc: Document, base: string, seen: Set<string>, result: FoundLink[]) {
    const add = (raw: string | null | undefined, text: string | null) => {
        if (!raw) return
        let url: string
        try {
            url = new URL(raw, base).toString()
        } catch {
            return
        }
        if (!/^https?:/i.test(url) || seen.has(url)) return
        seen.add(url)
        const ext = extensionOf(url)
        // plain page links are not downloads; only files with a known type are listed
        const group = groupOf(ext)
        if (!group) return
        result.push({url, ext, group, text: text?.trim() || null})
    }
    doc.querySelectorAll<HTMLAnchorElement>("a[href]").forEach(a => add(a.getAttribute("href"), a.textContent))
    doc.querySelectorAll<HTMLImageElement>("img[src]").forEach(img => add(img.getAttribute("src"), img.alt))
    doc.querySelectorAll("video[src], audio[src], source[src]").forEach(m => add(m.getAttribute("src"), null))
}

function collectLinks(): FoundLink[] {
    const result: FoundLink[] = []
    collectLinksFrom(document, location.href, new Set(), result)
    return result
}

const MAX_PAGES = 30

/** pages of the same site linked from this one (IDM grabber "depth 1") */
function linkedPages(): string[] {
    const pages = new Set<string>()
    document.querySelectorAll<HTMLAnchorElement>("a[href]").forEach(a => {
        try {
            const url = new URL(a.href, location.href)
            url.hash = ""
            if (url.origin !== location.origin || url.toString() === location.href) return
            const ext = extensionOf(url.toString())
            if (ext === "" || ["html", "htm", "php", "asp", "aspx", "jsp"].includes(ext)) pages.add(url.toString())
        } catch {
            // ignore bad links
        }
    })
    return Array.from(pages).slice(0, MAX_PAGES)
}

/** reads the linked pages (same site only, 4 at a time) and adds the files found in them */
async function crawlLinkedPages(found: FoundLink[], onProgress: (done: number, total: number) => void) {
    const seen = new Set(found.map(l => l.url))
    const pages = linkedPages()
    let done = 0
    onProgress(0, pages.length)
    const queue = [...pages]
    const worker = async () => {
        while (queue.length) {
            const page = queue.shift()!
            try {
                const response = await fetch(page, {credentials: "include"})
                const type = response.headers.get("content-type") ?? ""
                if (response.ok && type.includes("html")) {
                    const doc = new DOMParser().parseFromString(await response.text(), "text/html")
                    collectLinksFrom(doc, page, seen, found)
                }
            } catch {
                // unreachable page, skip it
            }
            onProgress(++done, pages.length)
        }
    }
    await Promise.all([worker(), worker(), worker(), worker()])
}

const styles = `
  .abdm-grabber { position: fixed; z-index: 2147483647; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(440px, 92vw); max-height: 80vh; display: flex; flex-direction: column;
    font: 13px "Segoe UI", Roboto, Helvetica, Arial, sans-serif; direction: ltr; color: #1d3557;
    background: #fff; border: 1px solid #6f8fbf; border-radius: 8px; box-shadow: 0 10px 40px rgba(0,0,0,.35); }
  .abdm-grabber * { box-sizing: border-box; }
  .abdm-grabber header { padding: 10px 14px; font-weight: 600; background: linear-gradient(#f4f8ff, #c9dcf7);
    border-bottom: 1px solid #8fa9cf; border-radius: 8px 8px 0 0; display: flex; justify-content: space-between; }
  .abdm-grabber .abdm-g-body { padding: 8px 14px; overflow: auto; }
  .abdm-grabber label { display: flex; align-items: center; gap: 8px; padding: 4px 0; cursor: pointer; }
  .abdm-grabber .abdm-g-exts { padding-left: 24px; font-size: 11px; opacity: .65; }
  .abdm-grabber footer { padding: 10px 14px; display: flex; gap: 8px; justify-content: flex-end; border-top: 1px solid #e3eaf5; }
  .abdm-grabber button { all: unset; cursor: pointer; padding: 6px 14px; border-radius: 5px; border: 1px solid #6f8fbf; }
  .abdm-grabber button.abdm-primary { background: #2a6fd6; color: #fff; border-color: #2a6fd6; }
  .abdm-grabber .abdm-g-empty { padding: 16px 0; opacity: .7; }
`

function close() {
    panel?.remove()
    panel = null
}

export function openGrabber() {
    close()
    const links = collectLinks()
    const root = document.createElement("div")
    root.className = "abdm-grabber"
    const style = document.createElement("style")
    style.textContent = styles
    root.appendChild(style)

    const header = document.createElement("header")
    const headerText = document.createElement("span")
    const closeX = document.createElement("span")
    closeX.textContent = "✕"
    closeX.style.cursor = "pointer"
    closeX.onclick = close
    header.append(headerText, closeX)
    root.appendChild(header)

    const body = document.createElement("div")
    body.className = "abdm-g-body"
    root.appendChild(body)
    // ticks survive re-rendering after the crawl adds more files
    const unticked = new Set<string>(["Images"])
    let checks: Array<[HTMLInputElement, string]> = []

    const render = () => {
        headerText.textContent = `Download all links — ${links.length} files found`
        body.innerHTML = ""
        checks = []
        if (links.length === 0) {
            const empty = document.createElement("div")
            empty.className = "abdm-g-empty"
            empty.textContent = "No downloadable files were found on this page."
            body.appendChild(empty)
        }
        for (const [group] of GROUPS) {
            const inGroup = links.filter(l => l.group === group)
            if (inGroup.length === 0) continue
            const label = document.createElement("label")
            const check = document.createElement("input")
            check.type = "checkbox"
            // images are usually page decoration, so they start unticked
            check.checked = !unticked.has(group)
            check.onchange = () => {
                if (check.checked) {
                    unticked.delete(group)
                } else {
                    unticked.add(group)
                }
            }
            label.append(check, `${group} (${inGroup.length})`)
            const exts = document.createElement("div")
            exts.className = "abdm-g-exts"
            exts.textContent = Array.from(new Set(inGroup.map(l => l.ext))).join(", ")
            body.append(label, exts)
            checks.push([check, group])
        }
        ok.style.display = links.length > 0 ? "" : "none"
    }

    const footer = document.createElement("footer")
    footer.style.justifyContent = "space-between"
    const deepLabel = document.createElement("label")
    const deep = document.createElement("input")
    deep.type = "checkbox"
    const deepText = document.createElement("span")
    deepText.textContent = `Also look inside linked pages of this site (up to ${MAX_PAGES})`
    deepLabel.append(deep, deepText)
    deepLabel.style.fontSize = "12px"
    deep.onchange = async () => {
        if (!deep.checked) return
        deep.disabled = true
        await crawlLinkedPages(links, (done, total) => {
            deepText.textContent = total === 0
                ? "No linked pages on this site"
                : `Reading linked pages… ${done} / ${total}`
            render()
        })
        deepText.textContent = `Linked pages read`
        render()
    }
    const buttons = document.createElement("div")
    buttons.style.display = "flex"
    buttons.style.gap = "8px"
    const cancel = document.createElement("button")
    cancel.textContent = "Cancel"
    cancel.onclick = close
    const ok = document.createElement("button")
    ok.className = "abdm-primary"
    ok.textContent = "Add to Net Download Manager"
    ok.onclick = async () => {
        const chosenGroups = checks.filter(([c]) => c.checked).map(([, g]) => g)
        const chosen = links.filter(l => chosenGroups.includes(l.group))
        close()
        if (chosen.length === 0) return
        const items: DownloadRequestItem[] = chosen.map(l => ({
            link: l.url,
            downloadPage: location.href,
            headers: null,
            description: l.text,
            suggestedName: null,
            type: "http",
        }))
        // the app's multi-download dialog lets the user untick single files
        await addDownloads(items)
    }
    buttons.append(cancel, ok)
    footer.append(deepLabel, buttons)
    root.appendChild(footer)
    render()

    root.addEventListener("keydown", e => {
        if (e.key === "Escape") close()
    })
    document.documentElement.appendChild(root)
    panel = root
}
