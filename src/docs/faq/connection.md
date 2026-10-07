## Connection

---

### WebRTC not supported.

If you see a WebRTC not supported message ensure you are using a browser that supports [WebRTC](https://caniuse.com/rtcpeerconnection) and also ensure that you don't have an extension that is blocking WebRTC connections. Some VPN extensions can cause this.

### Unable to connect to a player for audio sharing.

Audio sharing is sent directly between players using WebRTC, everything else in a game goes through the server. If you see this message a direct connection to another player couldn't be made, your maps and tokens are not affected.

This is usually caused by a network that blocks direct connections or an extension that blocks WebRTC. Some VPN extensions can cause this. The person hosting the server can also add a TURN server to relay audio between players that can't connect directly.
