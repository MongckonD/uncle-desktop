<div align="center">

# Uncle Desktop

**A little AI companion on your screen who speaks Thai, does things on your computer for you, and keeps an eye on your coding AI.**

[ภาษาไทย](README.th.md) · **English** · [Français](README.fr.md) · [Original Capri docs](README.upstream.md)

[![Release](https://img.shields.io/github/v/release/pk115/uncle-desktop?label=download)](https://github.com/pk115/uncle-desktop/releases/latest)
![Windows](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4)
![macOS](https://img.shields.io/badge/macOS-beta-black)
[![License](https://img.shields.io/badge/license-PolyForm%20Noncommercial-orange)](LICENSE)

<a href="docs/promo/01-character-companion-en.png"><img src="docs/promo/01-character-companion-en.png" alt="Uncle Desktop — Characters and AI chat (Windows + macOS)" width="680"></a>

<table>
<tr>
<td width="50%" align="center"><a href="docs/promo/02-voice-telegram-en.png"><img src="docs/promo/02-voice-telegram-en.png" alt="Uncle Desktop — Voice commands and Telegram" width="360"></a></td>
<td width="50%" align="center"><a href="docs/promo/03-work-coding-en.png"><img src="docs/promo/03-work-coding-en.png" alt="Uncle Desktop — Work and Coding Agent" width="360"></a></td>
</tr>
</table>

<details>
<summary>ดูโปสเตอร์ภาษาไทย / Thai posters</summary>

<a href="docs/promo/01-character-companion-th.png"><img src="docs/promo/01-character-companion-th.png" alt="Uncle Desktop — Characters and AI chat (Windows + macOS)" width="680"></a>

<table>
<tr>
<td width="50%" align="center"><a href="docs/promo/02-voice-telegram-th.png"><img src="docs/promo/02-voice-telegram-th.png" alt="Uncle Desktop — Voice commands and Telegram" width="360"></a></td>
<td width="50%" align="center"><a href="docs/promo/03-work-coding-th.png"><img src="docs/promo/03-work-coding-th.png" alt="Uncle Desktop — Work and Coding Agent" width="360"></a></td>
</tr>
</table>

</details>

<details>
<summary>App screenshot</summary>

<img src="docs/done.png" alt="Uncle Desktop on the screen" width="560">

</details>

</div>

> [!NOTE]
> Built on [Capri Desktop](https://github.com/mochiiwuff/capri-desktop) by [mochiiwuff](https://github.com/mochiiwuff), with many features inspired by [lachydotmcg's Capri](https://github.com/lachydotmcg/capri-desktop).

## Contents

- [Install](#install)
- **[Full user manual (Thai)](docs/MANUAL_TH.md)**
- [Features](#features)
  - [Characters](#-characters)
  - [Life on your desktop](#-life-on-your-desktop)
  - [Chat and her brain](#-chat-and-her-brain)
  - [Her voice](#-her-voice)
  - [Voice commands](#-voice-commands)
  - [The AI agent: computer control](#-the-ai-agent-computer-control)
  - [Quick asks in chat](#-quick-asks-in-chat)
  - [Personal assistant: mail and calendar](#-personal-assistant-mail-and-calendar-mcp)
  - [Music and the mini player](#-music-and-the-mini-player)
  - [Watching your coding AI](#-watching-your-coding-ai)
  - [Settings and system](#-settings-and-system)
- [Windows and Mac](#windows-and-mac)
- [Hotkeys](#hotkeys)
- [Privacy and safety](#privacy-and-safety)
- [For developers](#for-developers)
- [Release history](#release-history)
- [Credits and license](#credits-and-license)

## Install

| System | File | Notes |
|---|---|---|
| Windows 10 / 11 | `Uncle-Desktop-Setup-x.y.z.exe` | Updates itself |
| Mac, Apple silicon | `Uncle-Desktop-x.y.z-arm64.dmg` | Not signed by Apple: see the [Mac install guide (Thai)](docs/INSTALL_MAC_TH.md) |
| Mac, Intel | `Uncle-Desktop-x.y.z-x64.dmg` | Same as above |

Get them from **[Releases](https://github.com/pk115/uncle-desktop/releases/latest)**. On first launch, a step-by-step setup walks you through a character, an AI, her voice, the mic and your coding AI.

## Features

### 🎭 Characters

17 characters. Pick one with pictures in Settings › **Character**, or quickly from her right-click menu.

| UncleDev | Blacky | Mira | Pinky | Mochi | Lili |
| :---: | :---: | :---: | :---: | :---: | :---: |
| <img src="assets/characters/angry-boy/portrait.png" width="90"> | <img src="assets/characters/blacky/portrait.png" width="90"> | <img src="assets/characters/mira/portrait.png" width="90"> | <img src="assets/characters/pinky/portrait.png" width="90"> | <img src="assets/characters/mochi/portrait.png" width="90"> | <img src="assets/characters/lili/portrait.png" width="90"> |
| **Luna** | **Pudding** | **Bald Man** | **Cute Girl** | **Drunk Uncle** | **Lazy Boy** |
| <img src="assets/characters/luna/portrait.png" width="90"> | <img src="assets/characters/pudding/portrait.png" width="90"> | <img src="assets/characters/bald-man/portrait.png" width="90"> | <img src="assets/characters/cute-girl/portrait.png" width="90"> | <img src="assets/characters/drunk-uncle/portrait.png" width="90"> | <img src="assets/characters/lazy-boy/portrait.png" width="90"> |
| **Chubby Girl** | **Fatty Girl** | **Angry Guy** | **Vulture** | **Capri** (original) | |
| <img src="assets/characters/chubby-girl/portrait.png" width="90"> | <img src="assets/characters/fatty-girl/portrait.png" width="90"> | <img src="assets/characters/angry-guy/portrait.png" width="90"> | <img src="assets/characters/vulture/portrait.png" width="90"> | — | |

- Each one has their own personality, lines and poses
- **View:** full body, or upper body to see their face
- **Size:** several sizes to choose from
- **Quick switch:** point at her, hold Ctrl and turn the mouse wheel: down for the next character, up for the previous one
- **Import your own:** from your own atlas image. See [CHARACTERS.md](docs/CHARACTERS.md) and [ADD_YOUR_CHARACTER.md](docs/ADD_YOUR_CHARACTER.md)

### 🏙 Life on your desktop

- **Sits on your windows:** perches on window edges and follows them when they move
- **Drag and toss:** drag her, throw her, and she falls with gravity
- **Wanders when idle:** walks around, peeks from screen edges, or rides your cursor
- **Resting spot:** her corner, or sitting on the taskbar (the Dock on a Mac)
- **Several screens:** she notices when a screen is plugged in, unplugged or moved
- **Biochip:** Ctrl+Alt+C tucks her into a small chip in the corner
- **Jealous:** she gets jealous when ChatGPT, Gemini or another AI is in front
- **Reacts to your computer:** looks at your screen now and then and comments on it
- **Window effects:** she can "possess" your windows
- **Sync:** a bond that grows as you spend time together

### 💬 Chat and her brain

- **Brains:**
  - Ollama on your computer, which setup can install for you
  - OpenAI, Gemini, Mistral, DeepSeek
  - Pollinations, free with no key
  - Any OpenAI-compatible server
- **Three brain tiers:** NORMAL (fast), HIGHER (balanced), MAX INTELLIGENCE, picked from your provider's models
- **Memory:**
  - `personality.md`: you write who she is
  - `me.md`: she writes what she learns about you as you chat
- **Keys:** API keys are encrypted with your user account
- **Languages:** Thai first, plus English, French, Spanish, Portuguese and Russian

### 🔊 Her voice

| Service | Runs | Thai | Notes |
|---|---|:-:|---|
| Your computer's voices | locally | ✓ if installed | Windows SAPI or macOS `say` |
| Edge TTS | online | ✓ | Premwadee / Niwat, no key |
| **Kokoro** | **locally, free** | experimental | English, Japanese, Chinese and more, plus **experimental Thai** (understandable, with an accent); ~90 MB model downloaded once |
| OpenAI | online | ✓ | API key |
| ElevenLabs | online | ✓ | eleven_v3, any Voice ID |
| Fish Audio | online | ✓ | your cloned voices too |
| Your own server | wherever it is | depends on the model | OpenAI-compatible, e.g. Kokoro-FastAPI or your own model |

- **Voice effects:**
  - Pitch: ±12 semitones
  - Robot
  - Glitch: short dropouts
  - Layers: two more copies of her voice, one higher, one lower
- **Reads chat replies aloud** if you want, with her mouth moving to her voice
- **Kokoro reads Thai:** Thai text becomes phonemes through Thai spelling rules on your computer (word breaks, leading letters, clusters, numbers, times, ~130 irregular words); the Chinese voices (Xiaoxiao, Xiaobei) also get Thai tones, so they sound the most Thai

### 🎙 Voice commands

- **Three ways to listen:**
  - **Push to talk:** Ctrl+Alt+V, then speak
  - **Wake phrase:** one you set, such as "เฮ้ อังเคิล", checked on your computer
  - **Always listening:** speak any time, no wake phrase; noise and one-word sounds are dropped
- **Quick mode switch:** right-click › Mic mode starts listening that way at once, no dialog
- **Mic status:** a full bar, or a small icon bottom right that you can drag; the icon shows the step: 🎙 listening · 💬 turning speech into text · ⚡ doing it
- **Speech to text:**
  - Local Whisper: small, or Thonburian medium tuned for Thai
  - Gemini or OpenAI
- **Follow-up:** keep talking after waking her; she confirms risky steps and you can answer yes or no by voice
- **ElevenLabs Voice Agent:** continuous conversation you can interrupt, with 13 categories of app tools. See [VOICE_AGENT_TH.md](docs/VOICE_AGENT_TH.md)
- The mic starts off every launch. See [VOICE_COMMANDS_TH.md](docs/VOICE_COMMANDS_TH.md)

### 🤖 The AI agent: computer control

Ask for jobs in plain words, such as *"open Notepad and type a shopping list"*. She reads the window, plans, and works step by step, up to 30 steps per job.

- **Sees:** buttons, fields and text in your windows (UI Automation on Windows, Accessibility on Mac), plus a picture of the window if you allow it
- **Does:** click, double/right click, drag, type Thai, shortcuts, scroll, and switch, minimize or close windows
- **Longer jobs:**
  - waits for text to appear
  - notes what she read to use in a later step
  - opens several apps in one job
- **Games:** `hold_and_press`, such as holding W while pressing Space
- **Web pages:** rejects cookie banners, closes popups, looks things up on Google, and picks a song or video herself when you leave the choice to her
- **Talk to her mid-job:** type or say something while she works; she says "got it" and takes it into her next step
- **Her neon cursor:** glides to each spot just before she clicks
- **Proof before "done":** visible evidence on screen, or a second check by a vision model
- **Stop any time:** Esc or Ctrl+Alt+X

**Four security levels + ten switches**

| Level | What she does without asking |
|---|---|
| **Lockdown** | reads only, no clicks or typing |
| **Guarded** (recommended) | asks before anything with an effect: send, save, delete |
| **Trusted** | asks only about money, deleting, installing and power |
| **Blackwall** | never asks |

Every level can be fine-tuned with ten switches. Ticked means she does it without asking:

1. Open apps, sites and music
2. Click by position in the picture
3. Shortcuts
4. Close apps and windows
5. Volume and music
6. Shut down, restart, lock, sleep
7. Hold, drag and game keys
8. Send, post, save, confirm
9. Buy, pay, delete, install
10. Send window pictures to the AI

> [!IMPORTANT]
> At every level she **never types passwords or card numbers** and **never types commands into a terminal or PowerShell**. See [COMPUTER_CONTROL_TH.md](docs/COMPUTER_CONTROL_TH.md).

### ⚡ Quick asks in chat

Done right away, without a multi-step job:

- **Open:** apps, Steam/Epic games, websites and folders, e.g. *"open Discord, Spotify and Steam"*
- **Close apps:** she asks first
- **Find files:** Windows Search or Spotlight, then open the file or its folder
- **Music:** play a song on Spotify or YouTube; play, pause, skip, volume
- **Google searches and Roblox games**
- **Reminders:** e.g. *"remind me to eat in 20 minutes"*
- **Screenshots, and looking at your screen**

### 📬 Personal assistant: mail and calendar (MCP)

- **Gmail and Google Calendar:** connect them in Settings › **Assistant** with one Google OAuth key file. See [the guide (Thai)](docs/ASSISTANT_TH.md)
- **Ask in chat:** "summarize today's mail", "draft a reply to A", "what's on tomorrow", "book a meeting Wednesday 3 pm"
- **Important mail alerts:** checked every 3 minutes, with a button to open the mail
- **Meeting alerts:** 5, 10, 15 or 30 minutes before, with a button to join Meet, Zoom or Teams
- **Always asks first:** anything that sends, deletes or creates (sending mail, creating or deleting events)
- **Any other MCP server:** add it to `mcp.json`, the same shape as Claude Code's, and its tools work in chat

- **To-do list, meeting prep, VIP senders, unanswered mail, meeting conflicts, routines:** see [ASSISTANT_TH.md](docs/ASSISTANT_TH.md)

### 📰 News and daily briefs

- **News on your topics:** from Google News and your own RSS feeds, de-duplicated, summarized by AI on a schedule
- **Breaking news:** an alert at once for your words
- **Morning and evening briefs:** meetings, important mail, open tasks and news, read aloud if you like
- **Models by task:** chat / tools / computer control / background jobs / vision can each use their own model

### 📱 Telegram and Vibecode from your phone

- **Telegram:** text, voice messages, photos and videos; she answers in words or her voice; paired with your chat only
- **Alerts on your phone:** always, or only while you're away (LINE too)
- **Vibecode:** create projects and drive Claude Code or Codex by text, voice or a mockup; approve the agent's permissions on your phone; diff, commit, open a PR
- **The computer from your phone:** screenshots, computer jobs, lock or shut down; off by default and behind a PIN
- See [TELEGRAM_TH.md](docs/TELEGRAM_TH.md)

### 🎵 Music and the mini player

- **Mini player:** bottom right, shows what's playing (Thai titles too) in Spotify, a browser or any player your system knows, with ⏮ ⏯ ⏭
- **Full or a small ♪ icon:** Settings › Voice; drag it anywhere, its place is remembered; click the icon to play or pause, hover for the song
- **Dancing:** she dances while music plays
- Turn it on or off in Settings › Behavior

### 👨‍💻 Watching your coding AI

Hooks for **Claude Code**, **Codex** and **Antigravity**:

- **Ticker:** what the AI is doing, e.g. `EDITS file.ts`, `RUNS npm test`
- **Waiting for approval:** she teleports to your cursor and points at the window to click
- **Thinking indicator:** so you know it isn't stuck
- **Effects:** an impact when a command fails, a celebration with a mission report when it's done
- **Claude Code or Codex through local Ollama**

### ⚙ Settings and system

- **First run:** a six-step setup: character, AI, voice, mic, coding AI, done
- **Right-click menu:** short, with only what you use every day
- **Settings:** a seven-tab dialog in a cyberpunk theme
- **Hotkeys:** rebindable
- **Reset all settings:** a button you press twice to confirm
- **Updates:**
  - she tells you when a new version is out
  - Windows installs it when you restart
  - a Mac opens the download page
- **Start at login**
- **Error log:** errors go to `errors.txt` instead of crash dialogs

## Windows and Mac

| | Windows | Mac |
|---|---|---|
| Install and updates | updates itself | download by hand (not signed by Apple) |
| Computer control | UI Automation | Accessibility (allow once) |
| Window titles | always | needs Screen Recording |
| Local speech to text | Whisper, downloaded for you | whisper-cpp from Homebrew, on the GPU |
| Icon | system tray | menu bar |
| USB plug notices | ✓ | ✗ |
| Game list | Steam, Epic | Steam |

## Hotkeys

| Keys | What |
|---|---|
| `Ctrl+Alt+V` | talk, or turn the mic off |
| `Ctrl` + mouse wheel over her | switch character |
| `Ctrl+Alt+M` | mute |
| `Ctrl+Alt+C` | into her biochip, or back out |
| `Ctrl+Alt+X` | stop computer control |
| `Esc` | stop the job she's doing |

Change them in Settings › System › Hotkeys.

## Privacy and safety

- The mic starts off every launch
- Wake phrases are checked on your computer
- Every online service needs your consent first
- API keys are encrypted with your user account, never passed to the page and never logged
- Computer control sends only the current job's data to the AI, keeps no pictures, and sends none when a password field is showing
- Screen text is treated as data, never as instructions: she won't do what a web page tells her to

## For developers

Needs [Node.js](https://nodejs.org/) 20 or newer.

```bash
git clone https://github.com/pk115/uncle-desktop.git
cd uncle-desktop
npm install
npm start
```

| Command | What |
|---|---|
| `npm run dev` | the app with DevTools and the debug bridge |
| `npm test` | all tests |
| `npm run demo` | the animation demo |
| `npm run hooks:install` | Claude Code hooks |
| `npm run hooks:codex:install` | Codex hooks |
| `npm run hooks:agy:install` | Antigravity hooks |
| `npm run dist` | the Windows installer |
| `npm run dist:mac` | the `.dmg` on a Mac (builds the Swift computer helper too) |
| `npm run release` | build and upload to a draft GitHub Release (needs `GH_TOKEN`) |

Publishing a release makes GitHub Actions build the Mac `.dmg` files and attach them.

## Release history

| Version | What's new |
|---|---|
| **0.20.2** | Fix: the character never appeared in 0.20.0–0.20.1 (a file left out of a commit); the mini player switch applies at once; Kokoro keeps punctuation with Thai |
| **0.20.1** | App icon: UncleDev instead of Capri |
| **0.20.0** | Kokoro speaks Thai (experimental), always-listening mode, Mic mode menu, small draggable mic and player icons that show the step, Ctrl+wheel to switch characters, fix for dialogs that stopped taking clicks, Thai song titles, ~80 MB less memory |
| **0.19.0** | Telegram (text, voice, photos, video), Vibecode from your phone with Claude Code / Codex, news topics and briefs, local tasks, VIP mail, follow-ups, meeting prep, timed routines, remote PC control with PIN, LINE alerts |
| **0.18.0** | Personal assistant: MCP servers (Claude Code's mcp.json), Gmail and Google Calendar, alerts for important mail and meetings; tools that write ask first |
| 0.17.1 | Fix: dialogs that sometimes stopped taking clicks; size, full/upper body and AI model in the right-click menu |
| 0.17.0 | Three brain tiers; Kokoro free local voice + ElevenLabs + Fish + your own server; voice effects (pitch, robot, glitch, layers); ten security switches; mini player and dancing to music |
| 0.16.0 | Four security levels, talking mid-job, several apps in one ask, game keys, her neon cursor |
| 0.15.0 | The Windows features on a Mac: computer control, local speech to text, sitting on windows, music |
| 0.14.0 | First Mac build (Apple silicon and Intel) |
| 0.13.0 | Setup wizard, tabbed settings, short right-click menu, reset all, update notice |
| 0.12.2 | All-settings page, rebindable hotkeys, personality.md / me.md, upper-body view, errors.txt |
| 0.12.0 | New characters Mochi, Lili, Luna, Pudding |
| 0.11.0 | ElevenLabs Voice Agent |
| 0.9.0 | Multi-step computer control (Windows) |
| 0.8.x | Thai Thonburian speech to text, Gemini, self-updating |
| 0.5.0 – 0.7.0 | Windows installer, Thai voice, voice commands, wake phrases |

Details for each version are on [Releases](https://github.com/pk115/uncle-desktop/releases).

## Credits and license

- Built on [mochiiwuff/capri-desktop](https://github.com/mochiiwuff/capri-desktop) by mochiiwuff
- Many features inspired by [lachydotmcg/capri-desktop](https://github.com/lachydotmcg/capri-desktop)
- Maintained by **TheUncleDev** ([pk115/uncle-desktop](https://github.com/pk115/uncle-desktop))
- Voice models: [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M), [whisper.cpp](https://github.com/ggml-org/whisper.cpp), [Thonburian Whisper](docs/THONBURIAN_LICENSE.md)
- Licensed under [PolyForm Noncommercial 1.0.0](LICENSE)
