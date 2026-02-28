<img width="auto" height="300" alt="image" src="https://github.com/user-attachments/assets/fcfae42d-3924-406f-bedd-ea341a31d0dd" />
<img width="auto" height="300" alt="image" src="https://github.com/user-attachments/assets/69706366-03da-485a-bc96-f32cefa0cea6" />
<img width="auto" height="300" alt="image" src="https://github.com/user-attachments/assets/5fca4f62-2eb3-408b-bbc1-60047f3c6757" />

---

# Pester

![Tauri](https://img.shields.io/badge/tauri-%2324C8DB.svg?style=for-the-badge&logo=tauri&logoColor=%23FFFFFF)
![Vite](https://img.shields.io/badge/vite-%23646CFF.svg?style=for-the-badge&logo=vite&logoColor=white)
[![GitHub Container Registry](https://img.shields.io/badge/pester-ghcr.io-blue?logo=github&style=for-the-badge)](https://github.com/greeenboi/Pester/pkgs/container/pester)
[![Release](https://img.shields.io/badge/Release-v0.1.1Beta-brightgreen?style=for-the-badge)](https://github.com/greeenboi/Pester/releases/tag/v0.1.1)

**Pester** is a fun little toy app for you and your friends: when you’re bored, you can *pester* them with notifications and see who bites.

It’s also a **completely private, ephemeral chat system** — messages aren’t meant to stick around. Chat history clears, so conversations stay lightweight and temporary.

---

## What you can do

- **Pester your friends** with notifications (because sometimes you just need to cause a little chaos)
- **Chat privately** in a minimal, no-drama space
- **Keep it ephemeral**: chat history clears, so nothing turns into a forever-log

---

## Why it’s fun

Pester is built for those moments when:
- you’re bored,
- your group chat is dead,
- you want to poke someone to hop online,
- or you just want a private place to talk that *doesn’t* keep receipts.

It’s intentionally simple: quick notifications, quick replies, and then it’s gone.

---

## Privacy / Ephemeral by design

Pester is designed around the idea that not everything needs to be saved.
- **Private chatting**
- **Clearing chat history**
- **Less permanence, more “in the moment”**

*(If you want something that archives everything, this is probably not it — that’s the point.)*

---

## Deploy Server

[![Deploy to Koyeb](https://www.koyeb.com/static/images/deploy/button.svg)](https://app.koyeb.com/deploy?name=pester&type=git&repository=greeenboi%2FPester&branch=master&workdir=pester_server&builder=[...])

## Build

### For Windows

Feel free to use the binary in the releases.

> [!NOTE]
> The Windows binary in the releases is using my deployment so you will be limited by who else is using that particular binary.
> if you wish to host your own server instance (for free) you can click on the koyeb button above, and build your own binary.

You can also build your own binary (installer that you can share) on your windows system:

```sh
bun install
bun tauri build
```
This will create an unsigned installer (.exe) that you can share with your friends.

### For Macos

Unfortunately Macos has lots of limitations as is, so for any users they must build it themselves locally.

To create an Apple disk Image (DMG)

```sh
bun install
bun tauri build --bundles dmg
```

You can then drag the installer into your application folder.


### For Linux

This is fortunately is supported across most Linux Distributions:

```sh
bun install
bun tauri build
```
You will find the distributions in the `src-tauri/target/release/bundle/` directory (.deb or .appimage). 

You can share that.

> [!NOTE]
> I will be releasing this app to snapcraft if there is popular request.

---

## Status

This project is a toy / for-fun build. Expect rough edges, and feel free to contribute ideas or improvements.

> This Project is Licensed under GNU-GPL V3
