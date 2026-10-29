/**
 * Turns our own static markup (icons, labels from the add-on itself) into nodes without innerHTML.
 * Never pass text that comes from a website here; put that in with textContent.
 */
export function htmlToNodes(html: string): Node[] {
    const doc = new DOMParser().parseFromString(html, "text/html")
    return Array.from(doc.body.childNodes)
}

export function appendHtml(target: Node, html: string) {
    for (const node of htmlToNodes(html)) {
        target.appendChild(node)
    }
}
