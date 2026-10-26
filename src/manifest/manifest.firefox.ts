import {
    getBackgroundScript,
    getBaseManifest,
    getBrowserActionInfo,
    getCommonPermissions,
    getHostPermissions
} from "./shared";
import ManifestV2 = chrome.runtime.ManifestV2;

export function getManifestForFirefox(): ManifestV2 {
    return {
        manifest_version: 2,
        ...getBaseManifest(),
        background: {
            scripts: [getBackgroundScript()],
        },
        browser_specific_settings: {
            gecko: {
                id: "net-download-manager@phkero",
                // Firefox checks this file (attached to each GitHub release) and installs newer signed versions by itself
                update_url: "https://github.com/PhKero/net-download-manager/releases/latest/download/firefox-updates.json",
                // required by addons.mozilla.org for new add-ons; links only go to the app on this PC
                data_collection_permissions: {
                    required: ["none"],
                },
            } as any
        },
        browser_action: getBrowserActionInfo(),
        permissions: [
            ...getHostPermissions(),
            ...getCommonPermissions(),
            // only in firefox as it supports mv2
            "webRequestBlocking",
        ],
    }
}
