import {getLatestConfig} from "~/configs/Config";
import Constants from "~/utils/Constants";
import {isNullOrBlank} from "~/utils/StringUtils";

export interface VideoQuality {
    quality: string
    label: string
    size: number | null
}

export interface VideoInfo {
    type: "video" | "playlist" | "error"
    title?: string | null
    duration?: number | null
    qualities?: VideoQuality[]
    count?: number | null
    error?: string | null
}

/** asks the app (which runs yt-dlp) what is on a page; can take several seconds */
export async function fetchVideoInfo(link: string, downloadPage: string | null): Promise<VideoInfo> {
    const config = getLatestConfig()
    const headers: HeadersInit = {"Content-Type": "application/json"}
    if (!isNullOrBlank(config.apiKey)) {
        headers[Constants.authHeaderName] = config.apiKey
    }
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), 90_000)
    try {
        const response = await fetch(`http://localhost:${config.port}/video-info`, {
            method: "POST",
            headers,
            body: JSON.stringify({link, downloadPage}),
            signal: controller.signal,
        })
        if (!response.ok) {
            return {type: "error", error: `app answered ${response.status}`}
        }
        return await response.json() as VideoInfo
    } catch (e) {
        return {type: "error", error: "Net Download Manager is not running"}
    } finally {
        clearTimeout(id)
    }
}
