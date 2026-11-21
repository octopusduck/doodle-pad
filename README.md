# Doodle Pad

A small drawing app for iPhone, Android, and desktop browsers. **No ads, analytics, accounts, tracking, cloud storage, external fonts, JavaScript libraries, or API calls.** Everything is rendered on the device with Canvas 2D. The drawing is automatically backed up in the browser's local storage, and can be exported as a PNG.

## Brushes

- **Pen:** Solid-color freehand line
- **Moons:** Spaced crescent moons with a fixed tilt, crater details, and a soft glow
- **Clovers:** Spaced four-leaf clovers with heart-shaped leaves, veins, stems, and a soft glow
- **Glow dots:** Dots with a soft halo
- **Sparkles:** Scattered stars in the selected color or rainbow mix
- **Rainbow:** A continuous line that changes hue along the path
- **Color mix:** A line that switches between bright colors
- **Eraser:** Removes marks along your finger or mouse path, revealing the canvas color

The compact bottom toolbar has icons for **Brushes**, **Size**, **Color**, **Eraser**, **Canvas color**, **Undo**, **Redo**, and **Save**. Tap an icon to open its options above the toolbar without resizing the drawing. Only one options panel opens at a time; choose a brush or color, tap the icon again, start drawing, tap outside the toolbar, or press Escape to collapse it. Size stays open while adjusting the slider.

Under **Eraser**, choose **Erase with finger** for normal erasing, or **Erase everything** to clear the drawing with confirmation. Both can be undone. Use **Size** to change brush or eraser thickness. **Canvas color** offers white and black, preserves your drawing, and is remembered on this device. Saved PNGs include the selected background.

The black canvas also changes the surrounding controls and dialogs to dark gray. In **Color**, the **Rainbow spectrum** swatch cycles through hues along the path for moons, clovers, glow dots, and sparkles, using the same color progression as the Rainbow pen. Each stroke keeps the same colors through redraws, undo/redo, saving, and reload. The regular pen also supports this spectrum option; the Color mix brush retains its random palette.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | App screen, drawing area, buttons, and dialogs |
| `styles.css` | Touch-friendly, responsive layout |
| `app.js` | Pointer events, controls, local storage, undo/redo, PNG export |
| `brushes.js` | Brush definitions and Canvas rendering |
| `manifest.webmanifest` | Home Screen / PWA metadata |
| `service-worker.js` | Caches the app shell for offline use |
| `icons/` | Local app icons |
| `tests/` | Automated source and brush-rendering tests |

No build step is required. You can edit these files directly in VS Code.

Local previews on `localhost` or `127.0.0.1` load current files on refresh while the preview server is running. After updating from an older app version, allow the service worker update to finish and refresh once more to pick up this behavior. Hosted installations continue to update on the next launch.

## 1. Test on Windows in VS Code

1. Unzip the folder and open **`doodle-pad`** in VS Code using **File > Open Folder**.
2. Run it through a local HTTP server; don't double-click `index.html` (ES modules and service workers need an HTTP(S) origin).
3. If Python is installed, open a VS Code terminal in that folder and run:

   ```powershell
   py -m http.server 8000
   ```

   Open **http://localhost:8000** on the Windows machine. If `py` isn't available, you can use a VS Code extension like Live Server, or run `npx serve .` if you have Node.js. The app itself has no dependencies.

4. Draw with the mouse, test each brush, undo/redo, clear, and Save.

### Automated tests

If you have Node.js (version 18 or newer), run:

```powershell
npm test
```

These verify brush rendering, drawing/undo/backup behavior, the offline service worker, and key offline/privacy requirements. They **do not replace testing Safari on a physical iPhone**.

## 2. Publish the source to a *private* GitHub repository (from VS Code)

1. Sign in to GitHub inside VS Code using your personal account.
2. Open the **Source Control** tab in VS Code, select **Initialize Repository**, then commit your files.
3. Select **Publish to GitHub** and choose **Publish to GitHub private repository** (wording can vary).
4. Confirm that the destination is your **personal** GitHub account, not your work organization. Verify that the new repo says **Private** on GitHub.

No GitHub access needs to be given to ChatGPT. Also note: **A private repository is not itself a website**. Other phones cannot install the app just by receiving a link to the private repo.

## 3. Install on iPhone

To install it as a standalone offline Home Screen app, the files must be available from an **HTTPS URL**. They can be hosted by any static web host. GitHub repository privacy and website accessibility are separate things. GitHub Pages support for private repositories depends on your plan; a separately hosted static copy can be used while the source repository remains private.

1. Upload the *contents* of the project folder to an HTTPS static host. No server code or build command is needed.
2. Open the HTTPS address in **Safari** on the iPhone.
3. Tap **Share > Add to Home Screen**, enable **Open as Web App** if shown, then tap **Add** (iOS wording may vary).
4. Open **Doodle Pad** from the Home Screen once while connected, wait for the first load to finish, then test it in **Airplane Mode**.

The app's manifest uses standalone display mode, so launching the installed Home Screen app hides the browser address bar. Opening a normal browser tab still shows browser controls; the page cannot automatically hide them on launch.

Service workers cache all app files when first opened from HTTPS. After installation, the app runs locally even without an internet connection. Each time the app opens while online, it quietly checks your host for a newer version of its own files (see [Update the app](#update-the-app)); it makes no analytics or API requests. The hosting provider may record ordinary download/access logs.

**For family and friends:** share the HTTPS URL; they can install it the same way. An unlisted URL is *not* a privacy control; without a password or access control, anyone who knows the address could visit it.

### Save drawings on iPhone

Tap **Save** to see the image preview. Choose **Share image** (when supported) and select **Save Image** / **Save to Photos** from the iOS share sheet; alternatively, press and hold the preview and save it, or use **Download PNG**. Browser and iOS versions vary. The app does not transmit the image to a server; sharing to another app is always your own choice.

## Data & privacy

- No requests to ad networks, analytics services, third-party scripts, CDNs, or cloud storage.
- All painting and pattern effects are generated on-device.
- Completed strokes are automatically saved to **localStorage** on that device. The drawing should survive an ordinary reload (and completed strokes remain undoable), but the redo stack and special history such as an undoable clear are session-only. Browser storage is **not a permanent backup** and can be cleared by iOS or the user.
- **Save important pictures as PNG files.**
- No automatic uploads, push notifications, background sync, cookies, or tracking identifiers.
- No drawings are shared between users/devices.
- The file's Content Security Policy blocks external connections from the app page. Browser-managed service-worker updates and initial file downloads still contact the hosting origin as needed.

## Update the app

Upload the updated files to your HTTPS host. The app always opens instantly from its offline copy; when it opens while online, it re-checks its files in the background and the new version appears on the **next** launch. The new files are only stored if every one of them downloads, so a flaky connection can't leave a half-updated app.

If you add a new file the app loads (a script, image, etc.), also add it to `SHELL_FILES` in `service-worker.js` so it's available offline from the first launch. (Unlisted files still work online and are cached after their first use.)

Changing `CACHE_NAME` (`doodle-pad-v2`, `v3`, …) is optional. It makes the browser reinstall the service worker and start from a fresh cache, which is useful after changing `service-worker.js` itself. On iOS, "next launch" means fully closing the app from the app switcher and reopening it.

## Known limitations (first version)

- Drawings can shift or stretch slightly when changing from portrait to landscape, because positions are stored relative to canvas dimensions. Keep the orientation consistent for a single drawing.
- An extremely long single stroke (20,000+ points) is stored as two strokes, so it takes two Undos to remove.
- The local backup has a size limit. If a drawing grows past it, the app says so, keeps the last backup it could make, and you should save a PNG.
- A PNG is a flattened picture, not an editable stroke file.
- The app doesn't automatically copy pictures into Apple Photos; saving uses the browser/iOS Share sheet.
- The source is written to be testable in browsers, but still needs device testing on your iPhone.

## License

Doodle Pad is free to use and released under the [MIT License](LICENSE). You may use, copy, modify, share, and sell the app or your own version, including for commercial purposes. Keep the copyright and license notice with copies or substantial portions of the software. The software is provided without warranty.

## Contributing

Propose changes through a pull request. The repository owner, [@octopusduck](https://github.com/octopusduck), decides what is merged into the official app. Forks and pull requests do not change the published app automatically.

The `Tests` workflow runs `npm test` on pushes and pull requests with read-only repository permissions. `main` requires a pull request, passing tests on an up-to-date branch, and resolved review conversations, and blocks force pushes and branch deletion. These requirements also apply to the owner. Only the owner has repository write access; a second maintainer's approval is not required for the owner's own pull requests.
