# Mindscape Smart City AR — VS Code Project

This folder contains the complete browser-based Smart City AR classroom activity.

## Open and edit it in VS Code

1. Extract the ZIP file.
2. Open VS Code.
3. Choose **File → Open Folder**.
4. Select the extracted `Smart_City_AR_VSCode_2026-09-27` folder.

## Main files

- `index.html` — main student page.
- `styles.css` — main page design.
- `ar.html` — markerless AR screen.
- `boot-ar.js` — tablet compatibility check and AR loading flow.
- `markerless.js` — markerless camera, placement, missions, and touch controls.
- `city.js` — all Smart City 3D objects and their colors, sizes, and positions.
- `preview.html` — interactive 3D backup.
- `marker-ar.html` — marker-based AR backup.
- `qr.html` — classroom QR-code page.
- `assets/` — QR codes, marker files, and camera calibration data.
- `vendor/` — local A-Frame and AR.js libraries. Keep these files so the project does not depend on a CDN.

## Best way to preview it in VS Code

The pages should be opened through a local web server, not by double-clicking the HTML files.

### Option 1: VS Code Live Server

1. Install the **Live Server** extension in VS Code.
2. Right-click `index.html`.
3. Choose **Open with Live Server**.

### Option 2: Windows helper

Double-click `run-local-server.bat`. It starts a local server at:

`http://localhost:8000`

Python must be installed for this option.

## Important AR note

Interactive 3D can run locally, but phone/tablet camera AR normally requires HTTPS. To test markerless AR on another device, publish the edited folder to an HTTPS host and open it in a compatible Android Chrome browser.

## Quick editing guide

- To change the 3D buildings, vehicles, labels, colors, positions, or sizes: edit `city.js`.
- To change missions, badges, hints, success messages, or AR touch behavior: edit `markerless.js`.
- To change the AR instructions and layout: edit `ar.html`.
- To change the homepage text and buttons: edit `index.html` and `styles.css`.

After changing JavaScript, update the version number in the script URL so phones do not reuse an older cached file—for example, change `markerless.js?v=11` to `markerless.js?v=12`. The AR page loads `city.js` and `markerless.js` from `boot-ar.js`, so bump them there (and bump `boot-ar.js` itself in `ar.html`). `preview.html` and `marker-ar.html` load `city.js` directly.
