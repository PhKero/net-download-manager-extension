
export interface DownloadRequestItem {
    link: string
    downloadPage: string | null
    headers: DownloadRequestHeaders | null
    description: string | null,
    suggestedName: string | null,
    type: "hls" | "http" | "ytdlp"
    // only for "ytdlp": preferred quality token (best, h1080, audio...), the app shows its picker preselected
    quality?: string | null
    // only for "ytdlp": the link is a playlist, the app adds all of its videos
    playlist?: boolean
}
export type DownloadRequestHeaders = Record<string, string>
