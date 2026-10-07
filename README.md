# Owlbear Rodeo Legacy

> **This is an unofficial fork** ([owlbear-rodeo-bun](https://github.com/spitefulFr0g/owlbear-rodeo-bun)) that packages Owlbear Rodeo 1.0 as a single executable you can run yourself. It is not affiliated with or supported by the Owlbear Rodeo team. The original project is [owlbear-rodeo/owlbear-rodeo-legacy](https://github.com/owlbear-rodeo/owlbear-rodeo-legacy).

![Demo Image](/demo.jpg)

This is the source code for Owlbear Rodeo 1.0 released for your non-profit, non-commercial, private use.

This code won't be maintained or supported by us as we've moved all our time to maintaining and building the new Owlbear Rodeo.

## Background

Owlbear Rodeo was created as a passion project in early 2020.
We worked on the site from that time until late 2021, spending nights and weekends learning and building the site found in this repo.

By the end of 2021 we were spending more time working on Owlbear Rodeo than we were at our day jobs. After almost two years working on the project we had learnt a lot about what we wanted Owlbear Rodeo to be. With these two things in mind we decided to start working on a new version of Owlbear Rodeo, throwing out the old version and starting fresh.

This new version would streamline common actions, be able to grow with the user and be a lot more reliable. We called this version Owlbear Rodeo 2.0 and it is what you see now when opening [Owlbear Rodeo](https://owlbear.app) today.

Owlbear Rodeo 2.0 was released mid 2023 but as a thanks to our community we wanted to give you the option to build and run the original version.

## Programming Notes

This project marks one of the first big web projects Nicola and I made. With this in mind there are many things that aren't great with it.

The state management for the frontend relies primarily on React contexts. This is a bad idea. React contexts are great but not for a performance focused app like this. You'll see that every context that is used has to be split into a bunch of small chunks to prevent unnecessary re-renders. Don't do this. Just use a state management library like Zustand. It's so much easier and it's what we do in 2.0.

This code makes no effort to handle collisions when two users edit the same data at the same time. This means that it can be pretty easy to brick a map with a combination of delete/edit/undo between two users. Instead you should use a data structure that is designed to handle this like a CRDT. This is what we do in 2.0.

All images are stored client side in an IndexedDB database. I think this is a cool idea but browsers hate it when you do this. There are ways to tell the browser that you should keep this data around (the persistent storage API). But it's a bit of a mess. Chrome will silently decide if it wants to keep the data, FireFox will prompt the user for permission and Safari will ignore you. In fact if you don't visit the site every week Safari will delete all your data.
I thought I was being pretty clever when I created 1.0 with no cloud storage but it bit us hard having to tell users every week that there was no way to recover their data because the browser was cranky at them.

Because this project doesn't have user accounts or cloud storage to share an image with other players we use a peer-to-peer connection. To do this we use WebRTC. Be warned though every time I've decided to use WebRTC in a project I've regretted it. WebRTC is great on paper but it will never be reliable. Many VPNs/Antivirus/ISPs will block all WebRTC traffic. So you end up having to proxy a bunch of traffic through TURN/STUN servers which end up eating up any cost savings you thought you were going to have.

There are some pretty cool things in the project though.
I developed a Tensorflow model trained off of thousands of battle maps that can detect the number of grid cells visible in a map. The model is in the `src/ml` directory.
The 3D dice roller is physics driven which makes it fun to just throw dice around.
The pointer tool has a nice network interpolation model. This idea was expanded in 2.0 so that every interaction you do is synced in real-time with other players.

## Install

### Standalone executable

One file runs both the website and the game server. Start it on the computer that hosts the game:

```
./owlbear-rodeo-linux-x64            # Linux
owlbear-rodeo-windows-x64.exe        # Windows
```

It prints the addresses your players can open, for example `http://192.168.1.20:9000`. Players on the same network can use that address directly. Players on the internet need you to forward the port on your router and share your public address.

Options (each also has an environment variable):

| Flag | Environment | Default | Purpose |
| --- | --- | --- | --- |
| `--port`, `-p` | `PORT` | `9000` | Port to listen on |
| `--allow-origin` | `ALLOW_ORIGIN` | same origin only | Regex of extra origins allowed to connect |
| `--data-dir` | `DATA_DIR` | `data` beside the executable | Folder where maps and tokens used in games are kept |
| `--ice-servers` | `ICE_SERVERS_FILE` | Google's public STUN server | JSON file shaped like `backend/ice.json`. Only used for audio sharing, see [Troubleshooting](#troubleshooting) |

Maps and tokens are sent to the server over HTTP and kept in the data folder, so players load them from the server and no direct connection between players is needed. Each image can be up to 64MB. Nothing is removed from the data folder automatically.

Audio sharing only works over HTTPS or on `localhost`, so it is unavailable to players connecting over plain HTTP.

#### Building the executable

You need [Bun](https://bun.sh) and Docker. Docker is only used to build the frontend with Node 16. In `/backend`, run:

```
bun install
bun run build:frontend   # builds the website into /build (a few minutes, ~5GB RAM)
bun run build            # writes dist/owlbear-rodeo-linux-x64 and dist/owlbear-rodeo-windows-x64.exe
```

Pass a target to build just one, such as `bun run build linux-x64`. Use `bun run build:frontend --local` to build with a local Node 16 and Yarn instead of Docker.

### Production (or for non-developers)

The easiest way to host Owlbear Rodeo is by using a cloud provider.

To make this even easier we have provided a blueprint that will allow you to host it on [Render](https://render.com/).

Clicking the button bellow will open the Render website where you can create an account and setup a server for free.
Once deployed Render will provide a URL for you to share with your players.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

### Locally

#### **Docker**

Note: the Docker setup has not been updated for this fork's Bun backend yet.

To use the project with docker you can run the following from the root directory of the project:

```
docker-compose up
```

Note: You will need to increase your max memory allowed in Docker to 5GB in order to build Owlbear Rodeo.

#### **Manual**

If you don't want to use Docker you can run both the backend and frontend manually.

The backend needs [Bun](https://bun.sh). The frontend needs `NodeJS v16` and `Yarn`.

To run the backend in `/backend` run:

```
bun install
bun run dev
```

`bun run dev` restarts on changes and accepts connections from the frontend dev server on port 3000. Run the backend tests with `bun test`.

To run the frontend in the root folder run:

```
yarn start
```

## Troubleshooting

**Custom Images Aren't Showing on Other Computers**

Custom images go through the server, so STUN and TURN servers make no difference to them. Check that the player can reach the server and that the server can write to its data folder (`--data-dir`). The player who added the image has to be in the game once so their browser can send it to the server.

**Audio Sharing Isn't Working Between Some Players**

Audio sharing is the only feature that still uses WebRTC, a direct connection between players. Some networks block direct connections, in which case audio has to be relayed through a TURN server. Owlbear Rodeo doesn't include one, but you can point it at one you run yourself (for example [coturn](https://github.com/coturn/coturn)) or rent.

Copy `/backend/ice.json`, add your TURN server and start the server with `--ice-servers`:

```json
{
  "iceServers": [
    { "urls": "stun:stun.l.google.com:19302" },
    {
      "urls": "turn:turn.example.com:3478",
      "username": "owlbear",
      "credential": "a-password-for-this-server-only"
    }
  ]
}
```

```
./owlbear-rodeo-linux-x64 --ice-servers ./ice.json
```

The contents of this file are public. The server hands them to every browser that asks, before any game is joined, so anyone who can open your server can read the username and credential and use your TURN server. Use credentials made only for this purpose and limit bandwidth on the TURN server.

---

## License

This project is for **personal** use only.

We do not offer a license for commercial use.

You may not modify, publish, transmit, participate in the transfer or sale of, reproduce, create new works from, display, communicate to the public or in any way exploit, any part of this project in any way for commercial purposes.

If you're interested in using Owlbear Rodeo for commercial purposes you can contact us about version 2.0 here: contact@owlbear.rodeo

## Contributing

The code provided here is for historical purposes and as such we have disabled pull requests on this repository.

## Credits

This project was created by [Nicola](https://github.com/nthouliss) and [Mitch](https://github.com/mitchemmc).
In the live version of Owlbear Rodeo we provide default tokens that use licensed images.
To ensure that the license is adhered to we have replaced those images with CC0 images.
Here are a list of the image libraries used to make these new tokens:

- [496 pixel art icons for medieval/fantasy RPG](https://opengameart.org/content/496-pixel-art-icons-for-medievalfantasy-rpg)
- [CC0 Music Icons](https://opengameart.org/content/cc0-music-icons)
- [Dungeon Crawl 32x32 tiles supplemental](https://opengameart.org/content/dungeon-crawl-32x32-tiles-supplemental)
- [Zombie and Skeleton 32x48](https://opengameart.org/content/zombie-and-skeleton-32x48)
- [RPG portraits](https://opengameart.org/content/rpg-portraits)
