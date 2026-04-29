# Mii Sharing — Tomodachi Life: Living the Dream

<p align="center"><img src="docs/screenshots/logo.png" alt="Mii Sharing Logo" width="200" /></p>

Fan-made homebrew app for Nintendo Switch that lets you view, export, and import Miis in your Tomodachi Life: Living the Dream save data. Runs on top of [nx.js](https://github.com/TooTallNate/nx.js), a JavaScript runtime for Switch homebrew.

> [!WARNING]
> **Back up your save data before using this app.** This app reads and writes your Tomodachi Life: Living the Dream save file. Use [JKSV](https://github.com/J-D-K/JKSV) or another save manager to create a backup first. We are not responsible for any data loss.

## 🛋️ Motivation

Other tools like [Azkun/ShareMii](https://github.com/Azkun/ShareMii) require you to dump your save file to a PC, make changes there, and re-upload it to the Switch. That works — but it's a lot of steps just to add a friend's Mii - and I am too lazy for that :D.

The goal here is a different workflow: open the app directly on your homebrew Switch, browse your Miis, and import or export without ever touching a save file or getting up from the couch. Your Switch serves the UI over the local network, so you can use any phone or browser on the same WiFi — Switch in the dock, phone in hand, done. If you need a solution to edit your whole savefile easily, have a look at ShareMii. 

## 📋 Requirements

- Nintendo Switch with homebrew enabled
- Tomodachi Life: Living the Dream

## 📸 Screenshots
![Switch](docs/screenshots/switch.png)
![Import dialog](docs/screenshots/mii-list.png)
![Mii list view](docs/screenshots/backup.png)

## 🚀 Usage

**Deploy to Switch:**
Copy the resulting `.nro` to your Switch.

**Running:**

Once the app is launched on the Switch, it displays the Switch's local IP address. Open that address in a browser on any device on the same network (e.g. `http://192.168.1.x:8080`). Also supports mobile devices for easy side by side navigation.

**Exporting a Mii:**

Click a Mii in the list, then click "Export as .ltd". The browser downloads a `.ltd` file. You can then share that file with your friends.

**Importing a Mii:**

Click an occupied slot, then click "Import .ltd" and select a `.ltd` file from your device.

## 🛠️ Local Development

Requirements: Node.js, pnpm

```
pnpm install
```

Start the dev server against a local save file (requires a real `Mii.sav`):

```
MII_SAV_PATH=./testdata/Mii.sav pnpm dev
```

To develop the web UI against a running Switch app:

```
API_URL=http://<switch-ip>:8080 pnpm web:dev
```

## 📄 File Format

`.ltd` files use the **ltds** (Tomodachi Life Data Sharing) format, originally created by [Star-F0rce/ShareMii](https://github.com/Star-F0rce/ShareMii) and also used by [Azkun/ShareMii](https://github.com/Azkun/ShareMii). This app targets the current version of the format — note that the spec may evolve over time and compatibility is not guaranteed for future revisions.

Each file contains:

- `CharInfoRaw` — the raw Mii character data from the save
- Personality — 18 × uint32 values
- Name and pronunciation strings (UTF-16LE)
- Sexuality flags
- Optional: facepaint canvas (NSW block-linear swizzled RGBA8, 256×256) and ugctex blob, stored as compressed blobs after a fixed 428-byte header

The facepaint data uses the NSW block-linear swizzle layout. The deswizzle algorithm used here was ported from [tomodachi-texture-tool](https://github.com/farbensplasch/tomodachi-texture-tool).


## 🙏 Acknowledgements

- [Star-F0rce/ShareMii](https://github.com/Star-F0rce/ShareMii) — created the ltds file format that this app builds on.
- [Azkun/ShareMii](https://github.com/Azkun/ShareMii) — reference implementation for ltds and inspiration for the overall approach.
- [tomodachi-texture-tool](https://github.com/farbensplasch/tomodachi-texture-tool) by farbensplasch — MIT License. The NSW block-linear deswizzle algorithm used for facepaint canvas decoding was ported from this project.
- [nx.js](https://github.com/TooTallNate/nx.js) by TooTallNate — the JavaScript runtime this app is built on.
- [Tomodachi Share](https://tomodachishare.com) — community platform for sharing Miis. The Mii used in the screenshots was sourced from [tomodachishare.com/mii/45762](https://tomodachishare.com/mii/45762).

## 🤖 AI Disclosure

This project was built with AI assistance (Claude by Anthropic) acting as a development sparring partner — for additional code generation, code review, problem-solving, and discussion. All decisions, generated code and scripts were reviewed by a human.

## ⚖️ Legal

This is an unofficial fan project and is not affiliated with, endorsed by, or sponsored by Nintendo Co., Ltd. Tomodachi Life: Living the Dream and all related names, characters, and trademarks are the property of Nintendo Co., Ltd. All rights reserved.

This project does not distribute any game assets or proprietary data.
