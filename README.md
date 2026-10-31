# Net Download Manager: browser extension

The browser extension of [Net Download Manager](https://github.com/PhKero/net-download-manager),
a free, open-source download manager for Windows. The app must be installed for the extension to work.

<p><a href="#عربي">العربية</a></p>

It is a modified version of the
[AB Download Manager browser integration](https://github.com/amir1376/ab-download-manager-browser-integration)
(Apache-2.0). It is not affiliated with AB Download Manager or with Internet Download Manager (IDM).

## What it does

- a **"Download this video"** bar on videos (also inside embedded players), with the qualities and their sizes
- takes over file downloads from the browser and sends them to the app
- right-click **"Download with NDM"** and **"Download all links with NDM"**
- a **Download** button when you select part of a page that has links

## Install

**Firefox:** [addons.mozilla.org](https://addons.mozilla.org/firefox/addon/net-download-manager/), click *Add to Firefox*.

**Microsoft Edge:** [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/lccdhoiokomnkflbefggcbofjimmnlah), click *Get*.

### Install on Chrome

The extension is not in the Chrome Web Store, so it is added from a folder. You only do this once.

1. Get the extension folder, either way:
   - it is already inside the app: `C:\Users\<you>\AppData\Local\ABDownloadManager\app\resources\addons\chrome`
   - or download `NetDownloadManager-Chrome.zip` from the
     [latest release](https://github.com/PhKero/net-download-manager/releases/latest) and unzip it to a folder you will keep
2. In Chrome, open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick that folder.
5. Done. Pin the extension from the puzzle icon if you want its button on the toolbar.

Keep the folder where it is: Chrome loads the extension from it every time it starts.
This also works in **Brave** and other Chromium browsers (`brave://extensions`).

## Build

```bash
npm ci
npm run build:firefox   # dist/firefox
npm run build:chrome    # dist/chrome (also used for Edge)
```

## License

Apache-2.0, like the project it is based on. See [LICENSE](LICENSE) and [PRIVACY.md](PRIVACY.md).

---

<h2 id="عربي" dir="rtl">عربي</h2>

<div dir="rtl">

إضافة المتصفح بتاعة برنامج **Net Download Manager**. لازم البرنامج يكون متسطب عشان الإضافة تشتغل.

**التسطيب:**
- **Firefox:** من [متجر Mozilla](https://addons.mozilla.org/firefox/addon/net-download-manager/)، اضغط Add to Firefox.
- **Edge:** من [متجر Edge](https://microsoftedge.microsoft.com/addons/detail/lccdhoiokomnkflbefggcbofjimmnlah)، اضغط Get.

<h3 dir="rtl">التسطيب على Chrome</h3>

الإضافة مش موجودة في متجر كروم، فبتتضاف من فولدر. بتعمل كده مرة واحدة بس.

1. هات فولدر الإضافة بطريقة من دول:
   - موجود جوه البرنامج: `C:\Users\<اسمك>\AppData\Local\ABDownloadManager\app\resources\addons\chrome`
   - أو حمّل `NetDownloadManager-Chrome.zip` من [آخر إصدار](https://github.com/PhKero/net-download-manager/releases/latest) وفك ضغطه في فولدر هتسيبه
2. افتح في كروم `chrome://extensions`
3. فعّل **Developer mode** (فوق على اليمين).
4. اضغط **Load unpacked** واختار الفولدر.
5. خلاص. لو عايز زرار الإضافة يظهر، ثبّته من أيقونة البازل.

سيب الفولدر مكانه، لأن كروم بيفتح الإضافة منه كل مرة. نفس الخطوات بتشتغل على **Brave** وأي متصفح مبني على Chromium.

</div>
